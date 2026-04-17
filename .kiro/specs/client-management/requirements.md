# Documento de Requisitos — Gestión de Clientes

## Introducción

TractorPro actualmente permite escribir el nombre del cliente como texto libre al registrar un trabajo. Esta funcionalidad añade un catálogo de clientes persistente: el usuario puede crear, editar y eliminar clientes, y al registrar un trabajo puede seleccionar un cliente del catálogo o escribir uno nuevo con autocompletado. El objetivo es reducir errores de escritura, unificar nombres y facilitar el filtrado por cliente en el historial.

---

## Glosario

- **TractorPro**: La aplicación web de control de tractor (HTML/CSS/JS puro con localStorage).
- **Catálogo_de_Clientes**: La lista persistente de clientes guardada en localStorage bajo la clave `tractor_clients`.
- **Cliente**: Entidad con un nombre único que representa a quien contrata los servicios del tractor.
- **Registro_de_Trabajo**: Una entrada existente en `tractor_entries` que incluye el campo `client`.
- **Formulario_de_Trabajo**: El formulario HTML con id `tractor-form` usado para crear y editar registros de trabajo.
- **Campo_Cliente**: El input con id `client` dentro del Formulario_de_Trabajo.
- **Sección_Clientes**: La nueva sección de la UI dedicada a gestionar el Catálogo_de_Clientes.
- **Autocompletado**: Mecanismo que muestra sugerencias del Catálogo_de_Clientes mientras el usuario escribe en el Campo_Cliente.

---

## Requisitos

### Requisito 1: Catálogo de Clientes Persistente

**User Story:** Como operador de tractor, quiero mantener una lista de clientes guardada, para no tener que escribir el mismo nombre cada vez que registro un trabajo.

#### Criterios de Aceptación

1. THE TractorPro SHALL almacenar el Catálogo_de_Clientes en localStorage bajo la clave `tractor_clients` como un array JSON de objetos con los campos `id` (número), `name` (cadena) y `createdAt` (cadena ISO 8601).
2. WHEN la aplicación se inicializa, THE TractorPro SHALL cargar el Catálogo_de_Clientes desde localStorage; si la clave no existe, SHALL inicializar el catálogo como un array vacío.
3. THE TractorPro SHALL garantizar que no existan dos entradas en el Catálogo_de_Clientes con el mismo nombre (comparación sin distinción de mayúsculas/minúsculas).

---

### Requisito 2: Crear y Eliminar Clientes

**User Story:** Como operador de tractor, quiero agregar y eliminar clientes del catálogo, para mantener la lista actualizada.

#### Criterios de Aceptación

1. WHEN el usuario envía el formulario de nuevo cliente con un nombre no vacío y no duplicado, THE TractorPro SHALL agregar el cliente al Catálogo_de_Clientes, asignarle un `id` único basado en `Date.now()` y persistir el catálogo en localStorage.
2. IF el usuario envía el formulario de nuevo cliente con un nombre vacío o que ya existe en el Catálogo_de_Clientes, THEN THE TractorPro SHALL mostrar un mensaje de error descriptivo y no agregar el cliente.
3. WHEN el usuario confirma la eliminación de un cliente, THE TractorPro SHALL eliminar la entrada del Catálogo_de_Clientes y persistir el catálogo actualizado en localStorage.
4. WHEN el usuario confirma la eliminación de un cliente, THE TractorPro SHALL mostrar una notificación de confirmación usando el sistema de notificaciones existente.

---

### Requisito 3: Autocompletado en el Formulario de Trabajo

**User Story:** Como operador de tractor, quiero que el campo de cliente en el formulario de trabajo sugiera nombres del catálogo mientras escribo, para seleccionar rápidamente sin errores tipográficos.

#### Criterios de Aceptación

1. WHILE el Catálogo_de_Clientes contiene al menos un cliente, THE Campo_Cliente SHALL ofrecer sugerencias de autocompletado mediante un elemento `<datalist>` HTML vinculado al input.
2. WHEN el usuario escribe en el Campo_Cliente, THE TractorPro SHALL filtrar las sugerencias del `<datalist>` para mostrar únicamente los clientes cuyo nombre contiene el texto ingresado (sin distinción de mayúsculas/minúsculas).
3. THE Campo_Cliente SHALL seguir aceptando texto libre, de modo que el usuario pueda ingresar un nombre que no exista en el Catálogo_de_Clientes.
4. WHEN el Catálogo_de_Clientes se modifica (cliente agregado o eliminado), THE TractorPro SHALL actualizar el `<datalist>` del Campo_Cliente sin recargar la página.

---

### Requisito 4: Sección de Gestión de Clientes en la UI

**User Story:** Como operador de tractor, quiero una sección dedicada para ver y gestionar mis clientes, para tener control claro sobre el catálogo.

#### Criterios de Aceptación

1. THE TractorPro SHALL incluir una entrada de navegación "Clientes" en el sidebar con el mismo estilo visual que las entradas existentes.
2. WHEN el usuario navega a la Sección_Clientes, THE TractorPro SHALL mostrar la lista completa del Catálogo_de_Clientes ordenada alfabéticamente por nombre.
3. WHEN el Catálogo_de_Clientes está vacío y el usuario navega a la Sección_Clientes, THE TractorPro SHALL mostrar un mensaje indicando que no hay clientes registrados.
4. THE Sección_Clientes SHALL incluir un formulario para agregar nuevos clientes con un campo de nombre y un botón de guardar, con el mismo estilo visual que los formularios existentes.
5. THE Sección_Clientes SHALL mostrar un botón de eliminar por cada cliente en la lista, con el mismo estilo visual que los botones de acción existentes.

---

### Requisito 5: Compatibilidad con Datos Existentes

**User Story:** Como operador de tractor, quiero que mis registros de trabajo anteriores sigan funcionando correctamente después de agregar la gestión de clientes, para no perder información histórica.

#### Criterios de Aceptación

1. WHEN TractorPro se inicializa con registros existentes en `tractor_entries`, THE TractorPro SHALL mostrar el campo `client` de cada registro tal como fue guardado, independientemente de si ese nombre existe en el Catálogo_de_Clientes.
2. THE TractorPro SHALL mantener el filtro de búsqueda por cliente existente (input `client-filter`) funcionando con los datos históricos sin modificación.
3. WHEN el usuario elimina un cliente del Catálogo_de_Clientes, THE TractorPro SHALL conservar todos los Registros_de_Trabajo que referencian ese nombre de cliente sin modificarlos.
