-- ============================================================
-- TractorPro System - Database Setup Script
-- Ejecutar en el SQL Editor de tu proyecto Supabase
-- ============================================================

-- 1. TIPOS ENUMERADOS
-- ============================================================
CREATE TYPE user_role AS ENUM ('admin', 'operator');

-- 2. TABLA DE ROLES DE USUARIO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    role user_role NOT NULL DEFAULT 'operator',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA DE CONFIGURACIÓN (única fila)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    rate_per_hour NUMERIC(10,2) NOT NULL DEFAULT 15.00,
    CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO public.settings (id, rate_per_hour) VALUES (1, 15.00) ON CONFLICT (id) DO NOTHING;

-- 4. TABLA DE CLIENTES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    name_lower TEXT GENERATED ALWAYS AS (lower(name)) STORED,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT clients_name_unique UNIQUE (name_lower)
);

-- 5. TABLA DE REGISTROS DE TRABAJO (sin diesel)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.job_entries (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    work_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    hours NUMERIC(8,2) NOT NULL CHECK (hours > 0),
    revenue NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TABLA DE COMPRAS DE DIESEL (depósito único)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.diesel_purchases (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    gallons NUMERIC(8,2) NOT NULL CHECK (gallons > 0),
    price_per_gallon NUMERIC(10,2) NOT NULL CHECK (price_per_gallon > 0),
    total_cost NUMERIC(10,2) GENERATED ALWAYS AS (gallons * price_per_gallon) STORED,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. HABILITAR ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diesel_purchases ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 8. FUNCIÓN AUXILIAR: obtener el rol del usuario actual
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
SECURITY DEFINER
SET search_path = public
LANGUAGE sql STABLE AS $$
  SELECT role::TEXT FROM public.user_roles WHERE user_id = auth.uid();
$$;

-- ============================================================
-- 9. POLÍTICAS RLS — user_roles
-- ============================================================
CREATE POLICY "user_roles: lectura propia"
    ON public.user_roles FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- ============================================================
-- 10. POLÍTICAS RLS — settings
-- ============================================================
CREATE POLICY "settings: lectura autenticada"
    ON public.settings FOR SELECT
    TO authenticated USING (true);

CREATE POLICY "settings: actualizar solo admin"
    ON public.settings FOR UPDATE
    TO authenticated
    USING (get_my_role() = 'admin')
    WITH CHECK (get_my_role() = 'admin');

-- ============================================================
-- 11. POLÍTICAS RLS — clients
-- ============================================================
CREATE POLICY "clients: lectura autenticada"
    ON public.clients FOR SELECT
    TO authenticated USING (true);

CREATE POLICY "clients: insertar solo admin"
    ON public.clients FOR INSERT
    TO authenticated
    WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "clients: eliminar solo admin"
    ON public.clients FOR DELETE
    TO authenticated
    USING (get_my_role() = 'admin');

-- ============================================================
-- 12. POLÍTICAS RLS — job_entries
-- ============================================================
-- Admin ve todo; Operator solo los suyos
CREATE POLICY "job_entries: admin lee todo"
    ON public.job_entries FOR SELECT
    TO authenticated
    USING (get_my_role() = 'admin');

CREATE POLICY "job_entries: operator lee los suyos"
    ON public.job_entries FOR SELECT
    TO authenticated
    USING (get_my_role() = 'operator' AND user_id = auth.uid());

CREATE POLICY "job_entries: insertar autenticado"
    ON public.job_entries FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Solo el admin puede editar o eliminar cualquier registro
CREATE POLICY "job_entries: actualizar admin"
    ON public.job_entries FOR UPDATE
    TO authenticated
    USING (get_my_role() = 'admin')
    WITH CHECK (get_my_role() = 'admin');

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'job_entries'
          AND policyname = 'job_entries: actualizar app local'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "job_entries: actualizar app local"
                ON public.job_entries FOR UPDATE
                TO anon, authenticated
                USING (true)
                WITH CHECK (true)
        $pol$;
    END IF;
END;
$$;

CREATE POLICY "job_entries: eliminar admin"
    ON public.job_entries FOR DELETE
    TO authenticated
    USING (get_my_role() = 'admin');

-- ============================================================
-- 13. POLÍTICAS RLS — diesel_purchases
-- ============================================================
CREATE POLICY "diesel: admin lee todo"
    ON public.diesel_purchases FOR SELECT
    TO authenticated
    USING (get_my_role() = 'admin');

CREATE POLICY "diesel: operator lee los suyos"
    ON public.diesel_purchases FOR SELECT
    TO authenticated
    USING (get_my_role() = 'operator' AND user_id = auth.uid());

CREATE POLICY "diesel: insertar autenticado"
    ON public.diesel_purchases FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "diesel: eliminar admin"
    ON public.diesel_purchases FOR DELETE
    TO authenticated
    USING (get_my_role() = 'admin');

-- ============================================================
-- 14. TRIGGER: actualizar updated_at en job_entries
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER job_entries_updated_at
    BEFORE UPDATE ON public.job_entries
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- PASO FINAL: ASIGNAR ROLES POR EMAIL (ejecutar DESPUÉS de crear los usuarios)
-- Reemplaza los correos por los que usaste al crear los usuarios en Supabase Auth
-- ============================================================

DO $$
DECLARE
    v_admin_email    TEXT := 'admin@tractor.pro';     -- ← Cambia esto
    v_operator_email TEXT := 'operador@tractor.pro';  -- ← Cambia esto
    v_admin_id       UUID;
    v_operator_id    UUID;
BEGIN
    -- Obtener UUIDs automáticamente por email
    SELECT id INTO v_admin_id    FROM auth.users WHERE email = v_admin_email    LIMIT 1;
    SELECT id INTO v_operator_id FROM auth.users WHERE email = v_operator_email LIMIT 1;

    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'No se encontró el usuario administrador con email: %', v_admin_email;
    END IF;

    IF v_operator_id IS NULL THEN
        RAISE EXCEPTION 'No se encontró el usuario operador con email: %', v_operator_email;
    END IF;

    -- Insertar roles (ON CONFLICT evita duplicados si corres el script dos veces)
    INSERT INTO public.user_roles (user_id, role)
    VALUES
        (v_admin_id,    'admin'),
        (v_operator_id, 'operator')
    ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

    RAISE NOTICE 'Roles asignados correctamente: admin=% | operator=%', v_admin_id, v_operator_id;
END;
$$;
-- ============================================================

-- ============================================================
-- 15. MIGRACION DE COMPATIBILIDAD (reportes admin)
-- Ejecuta esta seccion para alinear la BD con la app actual.
-- ============================================================

-- 15.1 Columnas faltantes
ALTER TABLE public.settings
    ADD COLUMN IF NOT EXISTS diesel_price_per_gallon NUMERIC(10,2) NOT NULL DEFAULT 4.00;

ALTER TABLE public.job_entries
    ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 15.2 Tabla de entregas del operador al administrador
CREATE TABLE IF NOT EXISTS public.operator_advances (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL DEFAULT 'efectivo',
    notes TEXT,
    advance_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15.3 Tabla de cobros de deuda por trabajo
CREATE TABLE IF NOT EXISTS public.job_payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID REFERENCES public.job_entries(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operator_advances_date ON public.operator_advances(advance_date DESC);
CREATE INDEX IF NOT EXISTS idx_job_payments_date ON public.job_payments(payment_date DESC);

ALTER TABLE public.operator_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'operator_advances'
          AND policyname = 'advances: admin lee todo'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "advances: admin lee todo"
                ON public.operator_advances FOR SELECT
                TO authenticated
                USING (get_my_role() = 'admin')
        $pol$;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'job_payments'
          AND policyname = 'payments: lectura app local'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "payments: lectura app local"
                ON public.job_payments FOR SELECT
                TO anon, authenticated
                USING (true)
        $pol$;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'job_payments'
          AND policyname = 'payments: insertar app local'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "payments: insertar app local"
                ON public.job_payments FOR INSERT
                TO anon, authenticated
                WITH CHECK (
                    EXISTS (
                        SELECT 1
                        FROM public.job_entries je
                        WHERE je.id = job_payments.job_id
                    )
                )
        $pol$;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'diesel_purchases'
          AND policyname = 'diesel: operator lee todo'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "diesel: operator lee todo"
                ON public.diesel_purchases FOR SELECT
                TO authenticated
                USING (get_my_role() = 'operator')
        $pol$;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'diesel_purchases'
          AND policyname = 'diesel: actualizar operator todo'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "diesel: actualizar operator todo"
                ON public.diesel_purchases FOR UPDATE
                TO authenticated
                USING (get_my_role() = 'operator')
                WITH CHECK (get_my_role() = 'operator')
        $pol$;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'diesel_purchases'
          AND policyname = 'diesel: actualizar admin'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "diesel: actualizar admin"
                ON public.diesel_purchases FOR UPDATE
                TO authenticated
                USING (get_my_role() = 'admin')
                WITH CHECK (get_my_role() = 'admin')
        $pol$;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'diesel_purchases'
          AND policyname = 'diesel: actualizar operator suyo'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "diesel: actualizar operator suyo"
                ON public.diesel_purchases FOR UPDATE
                TO authenticated
                USING (get_my_role() = 'operator' AND user_id = auth.uid())
                WITH CHECK (get_my_role() = 'operator' AND user_id = auth.uid())
        $pol$;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'job_payments'
          AND policyname = 'payments: operator lee los suyos'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "payments: operator lee los suyos"
                ON public.job_payments FOR SELECT
                TO authenticated
                USING (
                    get_my_role() = 'operator'
                    AND EXISTS (
                        SELECT 1
                        FROM public.job_entries je
                        WHERE je.id = job_payments.job_id
                          AND je.user_id = auth.uid()
                    )
                )
        $pol$;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'job_payments'
          AND policyname = 'payments: insertar operador en sus trabajos'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "payments: insertar operador en sus trabajos"
                ON public.job_payments FOR INSERT
                TO authenticated
                WITH CHECK (
                    get_my_role() = 'operator'
                    AND EXISTS (
                        SELECT 1
                        FROM public.job_entries je
                        WHERE je.id = job_payments.job_id
                          AND je.user_id = auth.uid()
                    )
                )
        $pol$;
    END IF;
END;
$$;

-- ============================================================
-- 16. CIERRE MENSUAL DE CAJA (operador)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.monthly_closures (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    operator_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    period_year INTEGER NOT NULL CHECK (period_year >= 2000 AND period_year <= 2100),
    period_month INTEGER NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'confirmado', 'anulado')),
    cobrado_mes NUMERIC(12,2) NOT NULL DEFAULT 0,
    gastos_mes NUMERIC(12,2) NOT NULL DEFAULT 0,
    adelantos_mes NUMERIC(12,2) NOT NULL DEFAULT 0,
    base_comision NUMERIC(12,2) NOT NULL DEFAULT 0,
    comision_operador NUMERIC(12,2) NOT NULL DEFAULT 0,
    saldo_a_entregar_admin NUMERIC(12,2) NOT NULL DEFAULT 0,
    closing_advance_id UUID REFERENCES public.operator_advances(id) ON DELETE SET NULL,
    confirmed_at TIMESTAMPTZ,
    reopened_at TIMESTAMPTZ,
    reopen_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT monthly_closure_unique_period UNIQUE (operator_user_id, period_year, period_month)
);

CREATE TABLE IF NOT EXISTS public.monthly_closure_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    closure_id UUID REFERENCES public.monthly_closures(id) ON DELETE CASCADE NOT NULL,
    event_type TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    note TEXT,
    linked_row_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monthly_closures_period
    ON public.monthly_closures(operator_user_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_monthly_closures_status
    ON public.monthly_closures(status);
CREATE INDEX IF NOT EXISTS idx_monthly_closure_events_closure
    ON public.monthly_closure_events(closure_id, created_at DESC);

ALTER TABLE public.monthly_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_closure_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'monthly_closures_updated_at'
    ) THEN
        CREATE TRIGGER monthly_closures_updated_at
            BEFORE UPDATE ON public.monthly_closures
            FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'monthly_closures'
          AND policyname = 'closures: admin lee todo'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "closures: admin lee todo"
                ON public.monthly_closures FOR SELECT
                TO authenticated
                USING (get_my_role() = 'admin')
        $pol$;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'monthly_closures'
          AND policyname = 'closures: operator lee los suyos'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "closures: operator lee los suyos"
                ON public.monthly_closures FOR SELECT
                TO authenticated
                USING (get_my_role() = 'operator' AND operator_user_id = auth.uid())
        $pol$;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'monthly_closures'
          AND policyname = 'closures: insertar admin'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "closures: insertar admin"
                ON public.monthly_closures FOR INSERT
                TO authenticated
                WITH CHECK (get_my_role() = 'admin')
        $pol$;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'monthly_closures'
          AND policyname = 'closures: actualizar admin'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "closures: actualizar admin"
                ON public.monthly_closures FOR UPDATE
                TO authenticated
                USING (get_my_role() = 'admin')
                WITH CHECK (get_my_role() = 'admin')
        $pol$;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'monthly_closure_events'
          AND policyname = 'closure_events: admin lee todo'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "closure_events: admin lee todo"
                ON public.monthly_closure_events FOR SELECT
                TO authenticated
                USING (get_my_role() = 'admin')
        $pol$;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'monthly_closure_events'
          AND policyname = 'closure_events: insertar admin'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "closure_events: insertar admin"
                ON public.monthly_closure_events FOR INSERT
                TO authenticated
                WITH CHECK (get_my_role() = 'admin')
        $pol$;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'operator_advances'
          AND policyname = 'advances: operator lee los suyos'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "advances: operator lee los suyos"
                ON public.operator_advances FOR SELECT
                TO authenticated
                USING (get_my_role() = 'operator' AND user_id = auth.uid())
        $pol$;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'operator_advances'
          AND policyname = 'advances: insertar autenticado'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "advances: insertar autenticado"
                ON public.operator_advances FOR INSERT
                TO authenticated
                WITH CHECK (
                    get_my_role() = 'admin'
                    OR (get_my_role() = 'operator' AND user_id = auth.uid())
                )
        $pol$;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'operator_advances'
          AND policyname = 'advances: eliminar admin'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "advances: eliminar admin"
                ON public.operator_advances FOR DELETE
                TO authenticated
                USING (get_my_role() = 'admin')
        $pol$;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'job_payments'
          AND policyname = 'payments: admin lee todo'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "payments: admin lee todo"
                ON public.job_payments FOR SELECT
                TO authenticated
                USING (get_my_role() = 'admin')
        $pol$;
    END IF;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'job_payments'
          AND policyname = 'payments: insertar admin'
    ) THEN
        EXECUTE $pol$
            CREATE POLICY "payments: insertar admin"
                ON public.job_payments FOR INSERT
                TO authenticated
                WITH CHECK (get_my_role() = 'admin')
        $pol$;
    END IF;
END;
$$;
