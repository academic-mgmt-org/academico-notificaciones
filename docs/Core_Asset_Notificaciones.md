# Documento Técnico Core Asset: Notification Service (Notificaciones Académicas)

## 1. Información General

|Campo|Valor|
|---|---|
|Nombre|Notification Service|
|Tipo|Core Asset|
|Dominio|Comunicaciones y Alertas|
|Tecnología|Spring Boot equivalente de línea: NestJS + REST + Connect/gRPC|
|Base de Datos|PostgreSQL|
|Versión|1.0.0|
|Reutilizable|Sí|

---

# 2. Objetivo

Centralizar la creación, consulta y gestión de notificaciones académicas reutilizables para cualquier línea de producto.

Este servicio será responsable de:

- Registrar notificaciones para usuarios autenticados.

- Consultar notificaciones recientes.

- Consultar contador de no leídas.

- Marcar una notificación como leída.

- Marcar todas las notificaciones del usuario como leídas.

- Exponer contrato REST y contrato Connect/gRPC.

---

# 3. Responsabilidades

## Incluye

✅ Notificaciones in-app

✅ Persistencia en PostgreSQL

✅ Estados de lectura

✅ Integración con JWT emitido por Login

✅ Protección por API Key entre Gateway y microservicio

✅ Contrato Connect/gRPC reutilizable

✅ Script SQL idempotente

---

## No Incluye

❌ Login

❌ Emisión de JWT

❌ Gestión de usuarios

❌ Envío SMTP/SMS/push externo

❌ Auditoría transversal

Estas funciones pertenecen a otros Core Assets.

---

# 4. Ubicación en la Arquitectura

El `Notification Service` no administra el Gateway, no autentica credenciales y no administra usuarios. Su responsabilidad es gestionar notificaciones académicas para una identidad ya autenticada.

```text
Notification Service
│
├── Crear notificaciones
├── Consultar notificaciones recientes
├── Consultar contador de no leídas
├── Marcar una notificación como leída
├── Marcar todas las notificaciones como leídas
└── Persistencia en academico.notificaciones
```

Sus conexiones con el resto de la plataforma son integraciones:

```text
Cliente consumidor
(web, móvil, backend, gateway, otro microservicio)
      │
      │ Bearer JWT emitido por Authentication/Login
      │ x-api-key interna del servicio
      ▼
academico-gateway / backend integrador (opcional)
      │
      │ REST o Connect/gRPC
      ▼
Notification Service
      │
      ├── Obtiene identidad desde el JWT recibido
      │       email, identifier, userStudent, userProfessor
      │
      ├── Gestiona registros de notificación
      │       en academico.notificaciones
      │
      └── Devuelve notificaciones, contadores
              o cambios de estado al cliente integrador
```

El Gateway es una integración recomendada para exponer el servicio en la plataforma web/móvil, pero no es una dependencia interna del asset. Cuando se usa Gateway, registra el microservicio con el prefijo:

```text
/notificaciones/*
```

El cliente web de la plataforma consume actualmente el Gateway, no el microservicio directamente. Otros consumidores internos pueden invocar `academico-notificaciones` sin Gateway siempre que cumplan el contrato de seguridad del servicio.

Lectura correcta del flujo:

- `Authentication/Login`: emite el JWT. No es administrado por `academico-notificaciones`.
- `Gateway`: puede validar o enrutar solicitudes hacia `academico-notificaciones`. No es obligatorio para que el servicio exista ni para que sea reutilizable.
- `Cliente integrador`: debe enviar un JWT compatible y la API key interna si llama directamente al servicio.
- `academico.notificaciones`: es la tabla propia del asset y sí es gestionada por este servicio.
- `Gestión de Usuarios`: mantiene el ciclo de vida del usuario. `academico-notificaciones` no crea ni modifica usuarios; solo usa la identidad presente en el JWT.

El servicio es independiente desde el punto de vista funcional. Puede desplegarse y probarse como microservicio autónomo con REST o Connect/gRPC; en una arquitectura integrada, normalmente se publica detrás del Gateway para centralizar ruteo, validación transversal y exposición pública.

---

# 5. Modelo de Dominio

## Entidades principales

```text
Usuario
   │
   └── Notificación
          ├── Estado
          ├── Tipo
          ├── Prioridad
          └── Metadata
```

---

# 6. Casos de Uso

## CU-001 Consultar Notificaciones Recientes

Actor:

```text
Estudiante autenticado
```

Proceso:

```text
1. Web obtiene token de sesión
2. Web solicita recientes al Gateway
3. Gateway valida JWT con Login
4. Gateway redirige a academico-notificaciones
5. Servicio resuelve usuario por email/identificación
6. Servicio retorna últimas notificaciones
```

---

## CU-002 Consultar Contador de No Leídas

Permite mostrar:

- Badge del ícono de campana.

- Tarjeta de estadística de notificaciones.

---

## CU-003 Crear Notificación

Ejemplo:

```text
Calificaciones publica nota
↓
Notification Service registra alerta in-app
```

---

## CU-004 Marcar Notificación como Leída

Resultado:

```text
estado = leido
leido_en = timestamp actual
```

---

## CU-005 Marcar Todas como Leídas

Aplica sobre:

- Usuario autenticado.

- Notificaciones con estado `no_leido`.

---

# 7. Modelo de Datos

## notificaciones

```sql
CREATE TABLE academico.notificaciones (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id BIGINT NOT NULL,
  titulo VARCHAR(150) NOT NULL,
  mensaje TEXT NOT NULL,
  tipo VARCHAR(50) NOT NULL DEFAULT 'sistema',
  canal VARCHAR(30) NOT NULL DEFAULT 'in_app',
  prioridad VARCHAR(20) NOT NULL DEFAULT 'normal',
  estado VARCHAR(20) NOT NULL DEFAULT 'no_leido',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  leido_en TIMESTAMP NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## Índices

```sql
CREATE INDEX idx_notificaciones_usuario
ON academico.notificaciones(usuario_id);

CREATE INDEX idx_notificaciones_estado
ON academico.notificaciones(estado);

CREATE INDEX idx_notificaciones_usuario_estado
ON academico.notificaciones(usuario_id, estado);

CREATE INDEX idx_notificaciones_creado_en
ON academico.notificaciones(creado_en DESC);
```

---

# 8. Estados de Notificación

```text
no_leido
leido
archivado
```

---

# 9. Reglas de Negocio

## RN-001

Toda notificación debe pertenecer a un usuario.

---

## RN-002

El servicio resuelve el usuario desde JWT por:

```text
identifier
email
```

---

## RN-003

No se eliminan notificaciones desde el flujo funcional.

```text
Cambio de estado o retención por política
```

---

## RN-004

Solo el Gateway debe consumir el microservicio por HTTP público.

---

## RN-005

Toda solicitud protegida requiere:

```text
Authorization: Bearer <JWT>
x-api-key: <API key del microservicio>
```

---

# 10. Contrato gRPC

## notificaciones.proto

```protobuf
syntax = "proto3";

package notificaciones.v1;

service NotificationService {
  rpc ListNotifications(ListNotificationsRequest)
      returns(ListNotificationsResponse);

  rpc CountUnread(CountUnreadRequest)
      returns(CountUnreadResponse);

  rpc CreateNotification(CreateNotificationRequest)
      returns(NotificationResponse);

  rpc MarkAsRead(MarkReadRequest)
      returns(NotificationResponse);

  rpc MarkAllAsRead(MarkAllReadRequest)
      returns(GenericResponse);
}
```

---

## ListNotificationsRequest

```protobuf
message ListNotificationsRequest {
  string usuario_id = 1;
  string estado = 2;
  int32 limit = 3;
}
```

---

## Notification

```protobuf
message Notification {
  string id = 1;
  string usuario_id = 2;
  string titulo = 3;
  string mensaje = 4;
  string tipo = 5;
  string canal = 6;
  string prioridad = 7;
  string estado = 8;
  bool leida = 9;
  string icon_id = 10;
  string creado_en = 11;
  string leido_en = 12;
}
```

---

# 11. Contrato REST

## Consultar recientes

```text
GET /notificaciones/api/v1/notificaciones/recientes?limit=3
```

Respuesta:

```json
{
  "notifications": [
    {
      "id": "1",
      "titulo": "Nueva calificación publicada",
      "mensaje": "Nueva calificación publicada en Base de Datos",
      "estado": "no_leido",
      "iconId": "i-list",
      "time": "Hace 2 horas"
    }
  ],
  "unreadCount": 3,
  "usuarioId": "1"
}
```

---

## Consultar contador

```text
GET /notificaciones/api/v1/notificaciones/contador
```

---

## Crear notificación

```text
POST /notificaciones/api/v1/notificaciones
```

```json
{
  "email": "estudiante@utn.edu.ec",
  "titulo": "Solicitud aprobada",
  "mensaje": "Tu solicitud fue aprobada",
  "tipo": "solicitud",
  "prioridad": "normal"
}
```

---

## Marcar como leída

```text
PATCH /notificaciones/api/v1/notificaciones/{id}/leer
```

---

## Marcar todas como leídas

```text
PATCH /notificaciones/api/v1/notificaciones/leer-todas
```

---

# 12. Eventos de Dominio

El servicio puede ser invocado por otros Core Assets cuando ocurran eventos relevantes.

## USER_CREATED

```json
{
  "event": "USER_CREATED",
  "email": "estudiante@utn.edu.ec",
  "template": "WELCOME"
}
```

---

## GRADE_PUBLISHED

```json
{
  "event": "GRADE_PUBLISHED",
  "userId": "1",
  "course": "Base de Datos"
}
```

---

## REQUEST_APPROVED

```json
{
  "event": "REQUEST_APPROVED",
  "userId": "1",
  "requestId": "123"
}
```

---

# 13. Integraciones

## Authentication Service

Consume:

```text
JWT
identifier
email
```

---

## API Gateway

Registra:

```text
NOTIFICACIONES_BASE_URL
NOTIFICACIONES_API_KEY
```

---

## User Management Service

Relaciona:

```text
usuarios.id -> notificaciones.usuario_id
```

---

## Cliente Web

Consume:

```text
GET /notificaciones/api/v1/notificaciones/recientes
```

La pantalla `/home` muestra:

- Badge de notificaciones.

- Tarjeta de total.

- Lista de últimas notificaciones.

---

# 14. Observabilidad

## Logs

```json
{
  "service": "academico-notificaciones",
  "operation": "LIST_RECENT",
  "usuarioId": "1"
}
```

---

## Métricas

- Notificaciones creadas.

- Notificaciones no leídas.

- Tiempo promedio de respuesta.

- Errores por token inválido.

- Errores por API key inválida.

---

# 15. Seguridad

## Datos sensibles

No exponer:

```text
JWT
API keys
Secretos de base de datos
Payload completo del usuario
```

---

## Protección de datos

Aplicar:

- JWT validado por Gateway.

- API Key de microservicio.

- TLS en tráfico público.

- SSL hacia PostgreSQL.

- Respuestas sin información sensible.

---

# 16. Integración DevOps

## Azure Boards

Epic:

```text
Gestión de Notificaciones Académicas
```

Feature:

```text
Notificaciones Académicas
```

Historia:

```text
US-6 Consultar notificaciones recientes
```

---

## Pipeline

```text
1. npm install --legacy-peer-deps
2. npm run build
3. docker build -t academico-notificaciones
4. docker compose up -d
5. health check /api/health
6. prueba web con Playwright
```

---

## Commit

```bash
git commit -m "feat(notificaciones): implementar core asset de notificaciones AB#501"
```

---

## Pull Request

```text
Implementación Core Asset Notificaciones

Fixes AB#501
```

---

# 17. Quality Gates

|Métrica|Objetivo|
|---|---|
|Build|Exitoso|
|Vulnerabilidades críticas|0 nuevas|
|Bugs críticos|0|
|Latencia|< 150 ms en consulta reciente|
|Disponibilidad|99.9%|
|Health check|200 OK|

---

# 18. Roadmap Evolutivo

### Versión 1.0

- REST protegido por Gateway.

- Connect/gRPC para reutilización.

- Persistencia PostgreSQL.

- Integración con dashboard web.

---

### Versión 1.1

- Plantillas de notificación.

- Preferencias por usuario.

- Archivado funcional.

---

### Versión 1.2

- Canales externos:

```text
email
sms
push
```

---

# 19. Prueba de Validación

## Flujo validado

```text
Login Web
  ↓
JWT en sesión
  ↓
Laravel consulta Gateway
  ↓
Gateway valida JWT con Login
  ↓
Gateway reenvía a academico-notificaciones
  ↓
Servicio consulta PostgreSQL
  ↓
Dashboard renderiza notificaciones reales
```

---

## Script Playwright

Ubicación:

```text
/home/azureuser/scripts/academico-notificaciones-web.spec.js
```

Objetivo:

```text
Validar login, dashboard, badge, lista de últimas notificaciones y endpoint protegido vía Gateway.
```
