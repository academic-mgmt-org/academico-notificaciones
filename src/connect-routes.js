import { CatalogoService } from './gen/proto/catalogo/v1/catalogo_pb.js';
import getPool from './db.js';

/**
 * ConnectRPC routes definitions for Catalogo.
 * @param {import('@connectrpc/connect').ConnectRouter} router
 */
export default (router) => {
  router.service(CatalogoService, {
    async listarMaterias(req) {
      console.log("🔍 [CatalogoService] ListarMaterias called:", {
        carreraId: req.carreraId,
        carreraCodigo: req.carreraCodigo,
        nivelPeriodo: req.nivelPeriodo,
        mallaId: req.mallaId,
        soloMallaVigente: req.soloMallaVigente
      });

      const params = [];

      const addParam = (value) => {
        params.push(value);
        return `$${params.length}`;
      };

      const useMallaQuery = Boolean(
        req.nivelPeriodo > 0 ||
        req.carreraCodigo ||
        req.mallaId ||
        req.soloMallaVigente
      );

      let query;

      if (useMallaQuery) {
        query = `
          SELECT
            cu.id,
            cu.codigo,
            cu.nombre,
            cu.creditos,
            c.id AS carrera_id,
            c.codigo AS carrera_codigo,
            c.nombre AS carrera_nombre,
            mc.nivel_periodo,
            m.id AS malla_id,
            m.codigo AS malla_codigo,
            m.version AS malla_version,
            mc.orden,
            mc.tipo
          FROM academico.mallas_curriculares m
          INNER JOIN academico.carreras c
            ON c.id = m.carrera_id
          INNER JOIN academico.malla_cursos mc
            ON mc.malla_id = m.id
          INNER JOIN academico.cursos cu
            ON cu.id = mc.curso_id
          WHERE cu.estado = 'activo'
            AND mc.estado = 'activa'
            AND m.estado = 'activa'
        `;

        if (req.mallaId) {
          query += ` AND m.id::text = ${addParam(req.mallaId)}`;
        } else if (req.soloMallaVigente || req.nivelPeriodo > 0 || req.carreraCodigo) {
          query += " AND m.vigente IS TRUE";
        }

        if (req.carreraId) {
          query += ` AND c.id::text = ${addParam(req.carreraId)}`;
        }

        if (req.carreraCodigo) {
          query += ` AND c.codigo = ${addParam(req.carreraCodigo)}`;
        }

        if (req.nivelPeriodo > 0) {
          query += ` AND mc.nivel_periodo = ${addParam(req.nivelPeriodo)}`;
        }

        query += " ORDER BY c.codigo ASC, mc.nivel_periodo ASC, mc.orden ASC, cu.codigo ASC";
      } else {
        query = `
          SELECT
            cu.id,
            cu.codigo,
            cu.nombre,
            cu.creditos,
            c.id AS carrera_id,
            c.codigo AS carrera_codigo,
            c.nombre AS carrera_nombre,
            0 AS nivel_periodo,
            NULL::BIGINT AS malla_id,
            NULL::VARCHAR AS malla_codigo,
            NULL::VARCHAR AS malla_version,
            0 AS orden,
            '' AS tipo
          FROM academico.cursos cu
          LEFT JOIN academico.carreras c
            ON c.id = cu.carrera_id
          WHERE cu.estado = 'activo'
        `;

        if (req.carreraId) {
          query += ` AND cu.carrera_id::text = ${addParam(req.carreraId)}`;
        }

        query += " ORDER BY cu.id ASC";
      }

      try {
        const { rows } = await getPool().query(query, params);
        const materias = rows.map(row => ({
          id: String(row.id),
          codigo: row.codigo,
          nombre: row.nombre,
          creditos: row.creditos,
          carreraId: row.carrera_id ? String(row.carrera_id) : '',
          carreraCodigo: row.carrera_codigo || '',
          carreraNombre: row.carrera_nombre || '',
          nivelPeriodo: row.nivel_periodo || 0,
          mallaId: row.malla_id ? String(row.malla_id) : '',
          mallaCodigo: row.malla_codigo || '',
          mallaVersion: row.malla_version || '',
          orden: row.orden || 0,
          tipo: row.tipo || ''
        }));
        return { materias };
      } catch (error) {
        console.error("❌ [CatalogoService] Error querying database in listarMaterias:", error);
        throw error;
      }
    },
    async obtenerMateria(req) {
      console.log("🔍 [CatalogoService] ObtenerMateria called, id:", req.id);
      if (!req.id) {
        throw new Error("ID de materia requerido");
      }

      const query = `
        SELECT
          cu.id,
          cu.codigo,
          cu.nombre,
          cu.creditos,
          c.id AS carrera_id,
          c.codigo AS carrera_codigo,
          c.nombre AS carrera_nombre
        FROM academico.cursos cu
        LEFT JOIN academico.carreras c
          ON c.id = cu.carrera_id
        WHERE cu.id = $1
          AND cu.estado = 'activo'
      `;

      try {
        const { rows } = await getPool().query(query, [req.id]);
        if (rows.length === 0) {
          throw new Error("Materia no encontrada");
        }
        const row = rows[0];
        return {
          materia: {
            id: String(row.id),
            codigo: row.codigo,
            nombre: row.nombre,
            creditos: row.creditos,
            carreraId: row.carrera_id ? String(row.carrera_id) : '',
            carreraCodigo: row.carrera_codigo || '',
            carreraNombre: row.carrera_nombre || '',
            nivelPeriodo: 0,
            mallaId: '',
            mallaCodigo: '',
            mallaVersion: '',
            orden: 0,
            tipo: ''
          }
        };
      } catch (error) {
        console.error(`❌ [CatalogoService] Error querying database in obtenerMateria for ID ${req.id}:`, error);
        throw error;
      }
    }
  });
};
