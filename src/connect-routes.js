import { CatalogoService } from './gen/proto/catalogo/v1/catalogo_pb.js';

const MOCK_MATERIAS = [
  { id: '1', codigo: 'INF-101', nombre: 'Programación I', creditos: 4 },
  { id: '2', codigo: 'INF-102', nombre: 'Matemática Discreta', creditos: 3 },
  { id: '3', codigo: 'INF-201', nombre: 'Estructuras de Datos', creditos: 4 }
];

/**
 * ConnectRPC routes definitions for Catalogo.
 * @param {import('@connectrpc/connect').ConnectRouter} router
 */
export default (router) => {
  router.service(CatalogoService, {
    async listarMaterias(req) {
      console.log("🔍 [CatalogoService] ListarMaterias called, carreraId:", req.carreraId);
      return {
        materias: MOCK_MATERIAS
      };
    },
    async obtenerMateria(req) {
      console.log("🔍 [CatalogoService] ObtenerMateria called, id:", req.id);
      const materia = MOCK_MATERIAS.find(m => m.id === req.id);
      if (!materia) {
        throw new Error("Materia no encontrada");
      }
      return {
        materia
      };
    }
  });
};
