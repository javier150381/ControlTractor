# Documento de Requisitos — TractorPro System

## Introducción

TractorPro es una aplicación web (HTML/CSS/JS puro) para el control de operaciones de tractor: registro de trabajos, cálculo de ingresos, costos de diésel y ganancias. Esta expansión migra el almacenamiento de localStorage a Supabase, introduce autenticación con dos roles diferenciados (Operador y Administrador), un catálogo de clientes gestionado en la nube, y un módulo de reportes exclusivo para el Administrador. El sistema debe ser accesible simultáneamente desde múltiples dispositivos (celular y PC).

---

## Glosario

- **TractorPro**: La aplicación web de control de tractor (HTML/CSS/JS puro con Supabase como backend).
- **Supabase**: Plataforma de base de datos en la nube (PostgreSQL) con autenticación integrada que reemplaza a localStorage.
- **Supabase_Auth**: El módulo de autenticación de Supabase utilizado para gestionar sesiones de usuario.
- **Operador**: Rol de usuario con permisos limitados: puede crear registros de trabajo y ver únicamente sus propios registros.
- **Administrador**: Rol de usuario con permisos completos: puede ver, crear, editar y eliminar cualquier registro, gestionar clientes y acceder a reportes.
- **Sesión**: Estado de autenticación persistente mantenido por Supabase_Auth entre visitas al sitio.
- **Registro_de_Trabajo**: Entrada de datos que contiene: cliente, fecha, descripción, horas trabajadas, galones de diésel, ingreso calculado, costo de diésel calculado y ganancia neta calculada.
- **Catálogo_de_Clientes**: Lista persistente de clientes almacenada en Supabase, gestionada exclusivamente por el Administrador.
- **Cliente**: Entidad con nombre único que representa a quien contrata los servicios del tractor.
- **Formulario_de_Trabajo**: El formulario HTML para crear y editar Registros_de_Trabajo.
- **Campo_Cliente**: El input de texto dentro del Formulario_de_Trabajo para seleccionar o ingresar el nombre del cliente.
- **Reporte**: Vista agregada de Registros_de_Trabajo con totales calculados, accesible solo para el Administrador.
- **Tarifa_por_Hora**: Parámetro configurable en dólares que define el ingreso por hora trabajada.
- **Precio_por_Galón**: Parámetro configurable en dólares que define el costo por galón de diésel consumido.
- **Panel_de_Autenticación**: Pantalla de login mostrada cuando no existe una Sesión activa.
- **Dashboard**: Vista principal que muestra estadísticas resumidas y la tabla de Registros_de_Trabajo.

---

## Requisitos

### Requisito 1: Autenticación con Usuario y Contraseña

**User Story:** Como usuario del sistema, quiero iniciar sesión con usuario y contraseña, para que solo personas autorizadas accedan a la aplicación.

#### Criterios de Aceptación

1. WHEN un usuario no autenticado accede a TractorPro, THE TractorPro SHALL mostrar el Panel_de_Autenticación y ocultar todo el contenido de la aplicación.
2. WHEN el usuario envía el Panel_de_Autenticación con credenciales válidas, THE Supabase_Auth SHALL autenticar al usuario y THE TractorPro SHALL redirigir al Dashboard correspondiente a su rol.
3. IF el usuario envía el Panel_de_Autenticación con credenciales inválidas, THEN THE TractorPro SHALL mostrar un mensaje de error descriptivo sin revelar si el usuario o la contraseña son incorrectos.
4. WHEN la autenticación es exitosa, THE Supabase_Auth SHALL mantener la Sesión activa de forma persistente entre visitas al sitio, de modo que el usuario no deba autenticarse nuevamente al recargar o reabrir la aplicación.
5. WHEN el usuario cierra sesión, THE Supabase_Auth SHALL invalidar la Sesión activa y THE TractorPro SHALL mostrar el Panel_de_Autenticación.
6. THE TractorPro SHALL soportar exactamente dos cuentas de usuario: una con rol Operador y otra con rol Administrador, configuradas en Supabase_Auth.

---

### Requisito 2: Control de Acceso por Rol

**User Story:** Como administrador del sistema, quiero que cada rol tenga acceso únicamente a las funciones que le corresponden, para mantener la seguridad y separación de responsabilidades.

#### Criterios de Aceptación

1. WHILE la Sesión activa corresponde al rol Operador, THE TractorPro SHALL mostrar únicamente las secciones: Formulario_de_Trabajo y la tabla de sus propios Registros_de_Trabajo.
2. WHILE la Sesión activa corresponde al rol Operador, THE TractorPro SHALL ocultar las secciones de Reportes, gestión del Catálogo_de_Clientes y Configuración de parámetros.
3. WHILE la Sesión activa corresponde al rol Administrador, THE TractorPro SHALL mostrar todas las secciones: Dashboard completo, Formulario_de_Trabajo, tabla de todos los Registros_de_Trabajo, Reportes, Catálogo_de_Clientes y Configuración.
4. IF un usuario con rol Operador intenta acceder a una ruta o función restringida al Administrador, THEN THE TractorPro SHALL denegar el acceso y mostrar un mensaje de acceso no autorizado.
5. THE TractorPro SHALL aplicar las restricciones de acceso tanto en la interfaz de usuario como en las consultas a Supabase mediante Row Level Security (RLS).

---

### Requisito 3: Registro de Trabajos por el Operador

**User Story:** Como operador, quiero registrar nuevos trabajos con todos los datos necesarios, para mantener un historial preciso de mis actividades.

#### Criterios de Aceptación

1. WHEN el Operador envía el Formulario_de_Trabajo con todos los campos requeridos válidos, THE TractorPro SHALL crear un nuevo Registro_de_Trabajo en Supabase asociado al identificador del Operador autenticado.
2. THE TractorPro SHALL calcular automáticamente el ingreso como el producto de horas trabajadas por la Tarifa_por_Hora, el costo de diésel como el producto de galones por el Precio_por_Galón, y la ganancia neta como la diferencia entre ingreso y costo.
3. IF el Operador envía el Formulario_de_Trabajo con campos requeridos vacíos o con valores numéricos negativos, THEN THE TractorPro SHALL mostrar mensajes de validación descriptivos y no crear el registro.
4. WHEN el Operador navega a la vista de sus registros, THE TractorPro SHALL mostrar únicamente los Registros_de_Trabajo cuyo identificador de usuario coincide con el Operador autenticado.
5. THE TractorPro SHALL establecer la fecha del trabajo con el valor de la fecha actual como valor predeterminado en el Formulario_de_Trabajo.
6. WHILE la Sesión activa corresponde al rol Operador, THE TractorPro SHALL deshabilitar los botones de editar y eliminar en la tabla de Registros_de_Trabajo.

---

### Requisito 4: Gestión Completa de Registros por el Administrador

**User Story:** Como administrador, quiero poder ver, crear, editar y eliminar cualquier registro de trabajo, para mantener el control total sobre los datos del sistema.

#### Criterios de Aceptación

1. WHILE la Sesión activa corresponde al rol Administrador, THE TractorPro SHALL mostrar todos los Registros_de_Trabajo de todos los usuarios en la tabla del Dashboard.
2. WHEN el Administrador envía el Formulario_de_Trabajo con datos válidos, THE TractorPro SHALL crear un nuevo Registro_de_Trabajo en Supabase.
3. WHEN el Administrador selecciona editar un Registro_de_Trabajo, THE TractorPro SHALL cargar los datos del registro en el Formulario_de_Trabajo en modo edición y recalcular los valores derivados al guardar.
4. WHEN el Administrador confirma la eliminación de un Registro_de_Trabajo, THE TractorPro SHALL eliminar el registro de Supabase y actualizar la tabla sin recargar la página.
5. IF el Administrador envía el Formulario_de_Trabajo con campos requeridos vacíos o con valores numéricos negativos, THEN THE TractorPro SHALL mostrar mensajes de validación descriptivos y no guardar el registro.

---

### Requisito 5: Catálogo de Clientes

**User Story:** Como administrador, quiero gestionar un catálogo de clientes en la nube, para que el operador pueda seleccionar clientes de forma rápida y sin errores al registrar trabajos.

#### Criterios de Aceptación

1. THE TractorPro SHALL almacenar el Catálogo_de_Clientes en una tabla de Supabase con los campos: identificador único, nombre (cadena única), y fecha de creación (cadena ISO 8601).
2. THE TractorPro SHALL garantizar que no existan dos entradas en el Catálogo_de_Clientes con el mismo nombre (comparación sin distinción de mayúsculas/minúsculas), aplicando la restricción tanto en la interfaz como en la base de datos.
3. WHEN el Administrador envía el formulario de nuevo cliente con un nombre no vacío y no duplicado, THE TractorPro SHALL agregar el cliente al Catálogo_de_Clientes en Supabase.
4. IF el Administrador envía el formulario de nuevo cliente con un nombre vacío o duplicado, THEN THE TractorPro SHALL mostrar un mensaje de error descriptivo y no agregar el cliente.
5. WHEN el Administrador confirma la eliminación de un cliente, THE TractorPro SHALL eliminar la entrada del Catálogo_de_Clientes en Supabase y actualizar la lista sin recargar la página.
6. WHEN el Administrador elimina un cliente del Catálogo_de_Clientes, THE TractorPro SHALL conservar todos los Registros_de_Trabajo que referencian ese nombre de cliente sin modificarlos.
7. WHILE el Catálogo_de_Clientes contiene al menos un cliente, THE Campo_Cliente SHALL ofrecer sugerencias de autocompletado mediante un elemento `<datalist>` HTML vinculado al input, disponible tanto para el Operador como para el Administrador al registrar trabajos.
8. WHEN el Catálogo_de_Clientes se modifica, THE TractorPro SHALL actualizar el `<datalist>` del Campo_Cliente sin recargar la página.
9. THE Campo_Cliente SHALL seguir aceptando texto libre, de modo que el usuario pueda ingresar un nombre que no exista en el Catálogo_de_Clientes.

---

### Requisito 6: Reportes (solo Administrador)

**User Story:** Como administrador, quiero ver reportes diarios, mensuales y totales de las operaciones, para tomar decisiones informadas sobre la rentabilidad del negocio.

#### Criterios de Aceptación

1. WHILE la Sesión activa corresponde al rol Administrador, THE TractorPro SHALL mostrar una sección de Reportes en la navegación.
2. WHEN el Administrador accede al Reporte diario, THE TractorPro SHALL mostrar todos los Registros_de_Trabajo del día actual con sus totales: horas trabajadas, ingreso total, costo de diésel total y ganancia neta total.
3. WHEN el Administrador accede al Reporte mensual, THE TractorPro SHALL mostrar todos los Registros_de_Trabajo del mes en curso con sus totales: horas trabajadas, ingreso total, costo de diésel total y ganancia neta total.
4. WHEN el Administrador accede a los Totales Generales, THE TractorPro SHALL mostrar la suma acumulada de todos los Registros_de_Trabajo: horas totales, ingreso total, costo de diésel total y ganancia neta total.
5. WHEN el Administrador aplica un filtro de rango de fechas en la sección de Reportes, THE TractorPro SHALL recalcular y mostrar únicamente los Registros_de_Trabajo cuya fecha de trabajo se encuentra dentro del rango especificado (inclusive en ambos extremos).
6. IF el rango de fechas del filtro no contiene Registros_de_Trabajo, THEN THE TractorPro SHALL mostrar un mensaje indicando que no hay datos para el período seleccionado y mostrar todos los totales en cero.
7. WHEN el Administrador solicita exportar los datos del Reporte activo, THE TractorPro SHALL generar y descargar un archivo CSV con los registros filtrados y una fila de totales al final.

---

### Requisito 7: Configuración de Parámetros (solo Administrador)

**User Story:** Como administrador, quiero configurar la tarifa por hora y el precio del diésel, para que los cálculos de ingresos y costos reflejen los valores actuales del mercado.

#### Criterios de Aceptación

1. WHILE la Sesión activa corresponde al rol Administrador, THE TractorPro SHALL mostrar una sección de Configuración con campos para modificar la Tarifa_por_Hora y el Precio_por_Galón.
2. WHEN el Administrador guarda nuevos valores de Tarifa_por_Hora o Precio_por_Galón, THE TractorPro SHALL persistir los parámetros en Supabase y recalcular los valores derivados (ingreso, costo, ganancia) de todos los Registros_de_Trabajo existentes.
3. IF el Administrador ingresa un valor no numérico o negativo en los campos de configuración, THEN THE TractorPro SHALL mostrar un mensaje de validación descriptivo y no guardar los parámetros.
4. WHEN TractorPro se inicializa, THE TractorPro SHALL cargar la Tarifa_por_Hora y el Precio_por_Galón desde Supabase; si no existen valores configurados, SHALL usar los valores predeterminados: Tarifa_por_Hora = 15.00 y Precio_por_Galón = 2.95.

---

### Requisito 8: Migración a Supabase y Acceso Multi-Dispositivo

**User Story:** Como usuario del sistema, quiero que todos los datos estén en la nube, para poder acceder y registrar información desde mi celular y mi PC simultáneamente sin perder datos.

#### Criterios de Aceptación

1. THE TractorPro SHALL almacenar todos los datos (Registros_de_Trabajo, Catálogo_de_Clientes, parámetros de configuración y usuarios) exclusivamente en Supabase, sin depender de localStorage para datos persistentes.
2. WHEN dos sesiones activas (desde dispositivos distintos) realizan operaciones sobre Registros_de_Trabajo de forma simultánea, THE TractorPro SHALL reflejar los cambios en ambas sesiones sin pérdida de datos, apoyándose en la consistencia transaccional de Supabase.
3. WHEN TractorPro se inicializa en cualquier dispositivo con una Sesión activa válida, THE TractorPro SHALL cargar los datos actualizados desde Supabase sin requerir intervención del usuario.
4. IF la conexión a Supabase no está disponible al intentar guardar un Registro_de_Trabajo, THEN THE TractorPro SHALL mostrar un mensaje de error descriptivo indicando el fallo de conexión y no perder los datos ingresados en el formulario.

---

### Requisito 9: Compatibilidad con Datos Históricos de localStorage

**User Story:** Como operador, quiero que mis registros anteriores guardados en localStorage sigan siendo accesibles después de la migración, para no perder el historial de trabajo.

#### Criterios de Aceptación

1. WHEN TractorPro detecta datos existentes en localStorage bajo la clave `tractor_entries` durante la primera inicialización post-migración, THE TractorPro SHALL ofrecer al Administrador la opción de importar esos registros a Supabase.
2. WHEN el Administrador confirma la importación de datos históricos, THE TractorPro SHALL transferir todos los registros de localStorage a la tabla de Registros_de_Trabajo en Supabase, asignando el identificador del Administrador como propietario de los registros importados.
3. WHEN la importación de datos históricos se completa exitosamente, THE TractorPro SHALL limpiar las claves `tractor_entries` y `tractor_settings` de localStorage para evitar duplicados en futuras inicializaciones.
4. IF la importación de datos históricos falla parcialmente, THEN THE TractorPro SHALL mostrar un mensaje de error indicando cuántos registros se importaron correctamente y cuántos fallaron, y SHALL conservar los datos originales en localStorage sin modificarlos.
