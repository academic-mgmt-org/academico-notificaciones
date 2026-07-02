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

## Azure Pipelines

El pipeline usa Docker CLI para construir y publicar la imagen en Azure Container
Registry, evitando la dependencia del task `Docker@2`.

El pipeline requiere estas variables secretas en Azure DevOps:

- `ACR_USERNAME`
- `ACR_PASSWORD`

Los valores deben corresponder a una identidad con permisos de push/pull sobre
`acracademicoutn.azurecr.io`. La opcion recomendada es usar un service principal
con rol `AcrPush` limitado al registry:

```bash
ACR_ID="$(az acr show --name acracademicoutn --query id -o tsv)"
az ad sp create-for-rbac \
  --name academico-notificaciones-acr-push \
  --role AcrPush \
  --scopes "$ACR_ID"
```

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

✅ Envio de correo transaccional interno mediante `EmailService.SendEmail`

---

## No Incluye

❌ Login

❌ Emisión de JWT

❌ Gestión de usuarios

❌ SMS, push externo o campañas masivas

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

  rpc RecentNotifications(ListNotificationsRequest)
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

service HealthService {
  rpc Health(HealthRequest)
      returns(HealthResponse);

  rpc Ready(ReadyRequest)
      returns(ReadyResponse);

  rpc Live(LiveRequest)
      returns(LiveResponse);
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

# 11. Contrato Connect/gRPC

Los endpoints REST fueron retirados. El contrato público del servicio se expone por Connect/gRPC.

## Consultar notificaciones

```text
notificaciones.v1.NotificationService/ListNotifications
```

## Consultar recientes

```text
notificaciones.v1.NotificationService/RecentNotifications
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
notificaciones.v1.NotificationService/CountUnread
```

---

## Crear notificación

```text
notificaciones.v1.NotificationService/CreateNotification
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
notificaciones.v1.NotificationService/MarkAsRead
```

---

## Marcar todas como leídas

```text
notificaciones.v1.NotificationService/MarkAllAsRead
```

---

## Health checks

```text
notificaciones.v1.HealthService/Health
notificaciones.v1.HealthService/Ready
notificaciones.v1.HealthService/Live
```

---

## DTOs de integración Connect/gRPC

Los DTOs del core asset se implementan en:

```text
src/notifications/dto/notifications.dto.js
```

Estos objetos definen el contrato reutilizable para la línea de productos y evitan que Connect/gRPC y la lógica de negocio normalicen datos de forma diferente.

### DTOs de entrada

```text
NotificationRecipientDto
ListNotificationsRequestDto
RecentNotificationsRequestDto
CountUnreadRequestDto
CreateNotificationRequestDto
MarkReadRequestDto
MarkAllReadRequestDto
```

Responsabilidades:

- Resolver alias `camelCase` y `snake_case`, por ejemplo `usuarioId`, `usuario_id`, `iconId`, `icon_id`.
- Validar `estado` con los valores `no_leido`, `leido`, `archivado`.
- Normalizar `prioridad` con los valores `baja`, `normal`, `alta`, `critica`.
- Limitar consultas de listado a un rango seguro de 1 a 50 registros.
- Validar identificadores numéricos para usuario y notificación.
- Exigir `titulo` y `mensaje` al crear notificaciones.

### DTOs de salida

```text
NotificationDto
ListNotificationsResponseDto
CountUnreadResponseDto
NotificationResponseDto
GenericNotificationResponseDto
```

Responsabilidades:

- Mapear filas de `academico.notificaciones` al contrato público.
- Mantener respuesta REST en formato `camelCase`.
- Generar respuestas compatibles con Connect/gRPC mediante `toConnect()`.
- Exponer campos requeridos por el cliente web como `iconId`, `time`, `unreadCount` y `usuarioId`.

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
notificaciones.v1.NotificationService/RecentNotifications
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
Trigger:
- Rama main.

Stage Build:
1. Inicia sesión en Azure Container Registry con Docker CLI.
2. Construye la imagen desde Dockerfile.
3. El Dockerfile ejecuta npm install --legacy-peer-deps y npm run build.
4. Publica la imagen en Azure Container Registry:
   acracademicoutn.azurecr.io/academicmgmtorgacademiconotificaciones:$(Build.BuildId)

Stage DeployDevelopment:
1. Corre en el agente self-hosted self-hosted-agent.
2. Inicia sesión en Azure Container Registry.
3. Valida variables de entorno requeridas.
4. Conserva el PORT existente del .env remoto o usa 3003 como valor por defecto.
5. Genera el .env del servicio en /home/azureuser/academico-notificaciones.
6. Copia docker-compose.yml al directorio remoto.
7. Detiene composiciones anteriores.
8. Ejecuta docker compose pull.
9. Ejecuta docker compose up -d --remove-orphans.
10. Verifica que el contenedor academico-notificaciones quede en estado running.
11. Ejecuta docker compose ps y docker image prune -f.

Stage ApproveProduction:
1. Espera aprobación manual antes de producción.
2. Notifica y solicita aprobación a gacalderonr@utn.edu.ec.

Stage DeployProduction:
1. Corre en ubuntu-latest.
2. Inicia sesión en Azure Container Registry.
3. Usa PROD_SSH_HOST y PROD_SSH_PRIVATE_KEY_B64 para conectarse por SSH al servidor de produccion.
4. Copia la autenticación de Docker/ACR al servidor de producción.
5. Conserva el PORT existente del .env remoto o usa 3003 como valor por defecto.
6. Genera el .env del servicio en /home/azureuser/academico-notificaciones.
7. Copia docker-compose.yml al servidor.
8. Detiene composiciones anteriores.
9. Ejecuta docker compose pull.
10. Ejecuta docker compose up -d --remove-orphans.
11. Verifica que el contenedor academico-notificaciones quede en estado running.
12. Ejecuta docker compose ps y docker image prune -f.

Validaciones incluidas actualmente:
- Build de la aplicación dentro de la imagen Docker.
- Validación de variables de entorno requeridas.
- Verificación de contenedor running después del despliegue.

Validaciones no incluidas actualmente en azure-pipelines.yml:
- npm test / Jest.
- npm audit o escaneo de vulnerabilidades.
- Health check Connect/gRPC contra notificaciones.v1.HealthService/Health.
- Prueba web con Playwright.
```

---

## Commit

```bash
git commit -m "docs(notificaciones): document core asset completion AB#29"
```

---

## Pull Request

```text
Implementación Core Asset Notificaciones

Fixes AB#29
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

---

# 20. Levantar el servicio con Docker

Este repositorio incluye el script `scripts/levantar-notificaciones-docker.sh` para instalar Docker si no existe, descargar la imagen publicada y levantar el servicio con `docker compose`.

## 20.1. Clonar el repositorio

```bash
git clone https://github.com/academic-mgmt-org/academico-notificaciones.git
cd academico-notificaciones
```

## 20.2. Dar permisos de ejecución al script

```bash
chmod +x ./scripts/levantar-notificaciones-docker.sh
```

## 20.3. Preparar Docker y descargar la imagen

El script instala Docker y Docker Compose cuando no están disponibles, crea `.env` desde `.env.example` si todavía no existe, agrega los valores mínimos requeridos por `docker-compose.yml` y ejecuta:

```bash
docker pull guical96/academico-notificaciones:latest
```

Para instalar Docker y descargar la imagen sin levantar el contenedor:

```bash
./scripts/levantar-notificaciones-docker.sh --pull-only
```

## 20.4. Configurar variables de entorno

Antes de levantar el servicio, completa `.env` con las variables de la base de datos y seguridad. El script no sobrescribe valores existentes.

Valores mínimos:

```bash
ACADEMICO_NOTIFICACIONES_IMAGE=guical96/academico-notificaciones:latest
PORT=3003
NODE_ENV=production
ENV=production
NOTIFICACIONES_API_KEY=valor_seguro_para_consumidores_internos
NOTIFICACIONES_AUTO_SEED=true
JWT_DOC_SECRET=secreto_jwt_compartido

DB_HOST=host_postgresql
DB_PORT=5432
DB_DATABASE=nombre_base
DB_USER=usuario_base
DB_PASSWORD=password_base
DB_SSLMODE=require
```

Si PostgreSQL no usa SSL, cambia:

```bash
DB_SSLMODE=disable
```

## 20.5. Levantar el servicio

Con `.env` completo, ejecuta:

```bash
./scripts/levantar-notificaciones-docker.sh
```

El script ejecuta internamente:

```bash
docker compose -f docker-compose.yml up -d --remove-orphans
```

## 20.6. Verificar el despliegue

```bash
docker compose ps
docker logs -f academico-notificaciones
```

El servicio debe quedar expuesto en el puerto definido por `PORT`, por defecto:

```text
http://localhost:3003
```

Si el usuario actual no pertenece al grupo `docker`, el script usa `sudo` para la instalación y ejecución. Para usar Docker sin `sudo` en futuras sesiones, agrega el usuario al grupo `docker` y vuelve a iniciar sesión.
