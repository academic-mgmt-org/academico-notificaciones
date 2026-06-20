import { CatalogoService } from './gen/proto/catalogo/v1/catalogo_pb.js';
import getPool from './db.js';

/**
 * ConnectRPC routes definitions for Catalogo.
 * @param {import('@connectrpc/connect').ConnectRouter} router
 */
export default (router) => {
  router.service(CatalogoService, {
    async listarMaterias(req) {
      console.log("🔍 [CatalogoService] ListarMaterias called, carreraId:", req.carreraId);
      
      let query = "SELECT id, codigo, nombre, creditos FROM academico.cursos WHERE estado = 'activo'";
      const params = [];
      
      if (req.carreraId) {
        query += " AND carrera_id = $1";
        params.push(req.carreraId);
      }
      query += " ORDER BY id ASC";

      try {
        const { rows } = await getPool().query(query, params);
        const materias = rows.map(row => ({
          id: String(row.id),
          codigo: row.codigo,
          nombre: row.nombre,
          creditos: row.creditos
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

      const query = "SELECT id, codigo, nombre, creditos FROM academico.cursos WHERE id = $1 AND estado = 'activo'";
      
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
            creditos: row.creditos
          }
        };
      } catch (error) {
        console.error(`❌ [CatalogoService] Error querying database in obtenerMateria for ID ${req.id}:`, error);
        throw error;
      }
    }
  });
};

