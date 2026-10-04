/**
 * Shared contract every UsuarioDAO implementation must satisfy (in-memory fake and
 * Sequelize). Spec R-A2, R-A7.1; design section 4.1.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { NuevoUsuario, UsuarioDAO } from '../../src/dao/UsuarioDAO.js';
import { EstadoCuenta } from '../../src/enum/EstadoCuenta.js';
import { Rol } from '../../src/enum/Rol.js';
import { EmailYaRegistradoException } from '../../src/exception/usuario/EmailYaRegistradoException.js';

export interface EntornoDAO {
  dao: UsuarioDAO;
}

let secuencia = 0;
const nuevo = (extra: Partial<NuevoUsuario> = {}): NuevoUsuario => {
  secuencia += 1;
  return {
    nombre: 'Ana',
    apellido: 'Pérez',
    email: `ana${secuencia}@crowdradar.pe`,
    passwordHash: '$2b$04$hashdeprueba',
    telefono: null,
    distrito: null,
    ...extra,
  };
};

const prefijo = () => `lst${Date.now().toString(36)}${secuencia++}`;

export function contratoUsuarioDAO(nombre: string, crearEntorno: () => Promise<EntornoDAO>): void {
  describe(`UsuarioDAO contract: ${nombre}`, () => {
    let dao: UsuarioDAO;
    beforeEach(async () => {
      ({ dao } = await crearEntorno());
    });

    describe('crear', () => {
      it('persiste con defaults de dominio (USUARIO, ACTIVO, 0 karma) y asigna id', async () => {
        const creado = await dao.crear(nuevo({ nombre: 'Luz', telefono: '987654321', distrito: 'Miraflores' }));
        expect(creado).toMatchObject({
          nombre: 'Luz',
          telefono: '987654321',
          distrito: 'Miraflores',
          rol: Rol.USUARIO,
          status: EstadoCuenta.ACTIVO,
          puntosKarma: 0,
        });
        expect(creado.id).toBeGreaterThan(0);
        expect(creado.createdAt).toBeInstanceOf(Date);
        expect(await dao.buscarPorId(creado.id)).toEqual(creado);
      });

      it('guarda el email en minusculas', async () => {
        const creado = await dao.crear(nuevo({ email: 'MAYUS@CrowdRadar.PE' }));
        expect(creado.email).toBe('mayus@crowdradar.pe');
      });

      it('rechaza un email repetido (sin importar mayusculas) con EmailYaRegistradoException', async () => {
        await dao.crear(nuevo({ email: 'dup@crowdradar.pe' }));
        await expect(dao.crear(nuevo({ email: 'DUP@crowdradar.pe' }))).rejects.toBeInstanceOf(EmailYaRegistradoException);
      });
    });

    describe('buscar', () => {
      it('buscarPorEmail encuentra sin distinguir mayusculas y devuelve el hash', async () => {
        const creado = await dao.crear(nuevo({ email: 'busca@crowdradar.pe', passwordHash: 'hash-x' }));
        const hallado = await dao.buscarPorEmail('BUSCA@crowdradar.pe');
        expect(hallado?.id).toBe(creado.id);
        expect(hallado?.passwordHash).toBe('hash-x');
      });

      it('devuelve null cuando no existe', async () => {
        expect(await dao.buscarPorEmail('nadie@crowdradar.pe')).toBeNull();
        expect(await dao.buscarPorId(987654)).toBeNull();
      });
    });

    describe('actualizarPerfil', () => {
      it('cambia solo los campos enviados y permite limpiar telefono con null', async () => {
        const creado = await dao.crear(nuevo({ telefono: '987654321', distrito: 'Lince' }));
        const actualizado = await dao.actualizarPerfil(creado.id, { nombre: 'Anita', telefono: null });
        expect(actualizado).toMatchObject({ nombre: 'Anita', apellido: 'Pérez', telefono: null, distrito: 'Lince' });
        expect(await dao.buscarPorId(creado.id)).toEqual(actualizado);
      });

      it('devuelve null si el usuario no existe', async () => {
        expect(await dao.actualizarPerfil(987654, { nombre: 'X' })).toBeNull();
      });
    });

    describe('actualizarPasswordHash', () => {
      it('reemplaza el hash y responde true; false si no existe', async () => {
        const creado = await dao.crear(nuevo());
        expect(await dao.actualizarPasswordHash(creado.id, 'hash-nuevo')).toBe(true);
        expect((await dao.buscarPorId(creado.id))?.passwordHash).toBe('hash-nuevo');
        expect(await dao.actualizarPasswordHash(987654, 'x')).toBe(false);
      });
    });

    describe('actualizarStatus', () => {
      it('suspende y reactiva; null si no existe', async () => {
        const creado = await dao.crear(nuevo());
        expect((await dao.actualizarStatus(creado.id, EstadoCuenta.SUSPENDIDO))?.status).toBe(EstadoCuenta.SUSPENDIDO);
        expect((await dao.actualizarStatus(creado.id, EstadoCuenta.ACTIVO))?.status).toBe(EstadoCuenta.ACTIVO);
        expect(await dao.actualizarStatus(987654, EstadoCuenta.SUSPENDIDO)).toBeNull();
      });
    });

    describe('incrementarKarma', () => {
      it('suma y devuelve el total; nunca baja de 0', async () => {
        const creado = await dao.crear(nuevo());
        expect(await dao.incrementarKarma(creado.id, 10)).toBe(10);
        expect(await dao.incrementarKarma(creado.id, 2)).toBe(12);
        expect(await dao.incrementarKarma(creado.id, -50)).toBe(0);
        expect(await dao.incrementarKarma(987654, 1)).toBeNull();
      });
    });

    describe('listar', () => {
      it('pagina y calcula total y totalPaginas; filtra por q (nombre, apellido o email) y status', async () => {
        const p = prefijo();
        const a = await dao.crear(nuevo({ nombre: `${p}Ana`, email: `${p}.a@crowdradar.pe` }));
        await dao.crear(nuevo({ nombre: `${p}Beto`, email: `${p}.b@crowdradar.pe` }));
        await dao.crear(nuevo({ nombre: `${p}Carla`, apellido: 'Zeta', email: `${p}.c@crowdradar.pe` }));
        await dao.actualizarStatus(a.id, EstadoCuenta.SUSPENDIDO);

        const pagina1 = await dao.listar({ q: p, orden: 'NOMBRE' }, { page: 1, size: 2 });
        expect(pagina1.items.map((u) => u.nombre)).toEqual([`${p}Ana`, `${p}Beto`]);
        expect(pagina1).toMatchObject({ page: 1, size: 2, total: 3, totalPaginas: 2 });

        const pagina2 = await dao.listar({ q: p, orden: 'NOMBRE' }, { page: 2, size: 2 });
        expect(pagina2.items.map((u) => u.nombre)).toEqual([`${p}Carla`]);

        const suspendidos = await dao.listar({ q: p, status: EstadoCuenta.SUSPENDIDO }, { page: 1, size: 10 });
        expect(suspendidos.items.map((u) => u.id)).toEqual([a.id]);
        expect(suspendidos.total).toBe(1);

        const porApellido = await dao.listar({ q: 'zeta' }, { page: 1, size: 10 });
        expect(porApellido.items.some((u) => u.nombre === `${p}Carla`)).toBe(true);
      });

      it('trata % y _ de q como texto literal (ILIKE escapado)', async () => {
        const p = prefijo();
        await dao.crear(nuevo({ nombre: `${p}Ana`, email: `${p}.x@crowdradar.pe` }));
        expect((await dao.listar({ q: `${p}%` }, { page: 1, size: 10 })).total).toBe(0);
        expect((await dao.listar({ q: `${p}_na` }, { page: 1, size: 10 })).total).toBe(0);
        expect((await dao.listar({ q: `${p}Ana` }, { page: 1, size: 10 })).total).toBe(1);
      });

      it('ordena por karma descendente', async () => {
        const p = prefijo();
        const bajo = await dao.crear(nuevo({ nombre: `${p}Bajo`, email: `${p}.1@crowdradar.pe` }));
        const alto = await dao.crear(nuevo({ nombre: `${p}Alto`, email: `${p}.2@crowdradar.pe` }));
        await dao.incrementarKarma(bajo.id, 3);
        await dao.incrementarKarma(alto.id, 9);
        const pagina = await dao.listar({ q: p, orden: 'KARMA' }, { page: 1, size: 10 });
        expect(pagina.items.map((u) => u.id)).toEqual([alto.id, bajo.id]);
      });
    });
  });
}
