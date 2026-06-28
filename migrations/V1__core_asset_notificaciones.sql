SET search_path TO academico, public;

CREATE TABLE IF NOT EXISTS notificaciones (
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
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_notificaciones_estado
    CHECK (estado IN ('no_leido', 'leido', 'archivado')),
  CONSTRAINT chk_notificaciones_prioridad
    CHECK (prioridad IN ('baja', 'normal', 'alta', 'critica'))
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'academico'
      AND table_name = 'usuarios'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'academico'
      AND table_name = 'notificaciones'
      AND constraint_name = 'fk_notificaciones_usuario'
  ) THEN
    ALTER TABLE notificaciones
      ADD CONSTRAINT fk_notificaciones_usuario
      FOREIGN KEY (usuario_id)
      REFERENCES usuarios(id)
      ON UPDATE CASCADE
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario
  ON notificaciones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_estado
  ON notificaciones(estado);
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_estado
  ON notificaciones(usuario_id, estado);
CREATE INDEX IF NOT EXISTS idx_notificaciones_creado_en
  ON notificaciones(creado_en DESC);
