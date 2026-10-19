/** container/moderacion.ts: the facade is wired from the configuration (SUSPENSION_DIAS_PERMITIDOS) and the injected ports. */
import { describe, expect, it } from 'vitest';
import { construirInfraestructura } from '../../src/container/infraestructura.js';
import { crearModeracionFacade } from '../../src/container/moderacion.js';
import { Rol } from '../../src/enum/Rol.js';
import { ValidacionException } from '../../src/exception/http/ValidacionException.js';
import { EmisorTokenFalso } from '../support/adapter/EmisorTokenFalso.js';
import { CorreoEspia } from '../support/adapter/CorreoEspia.js';
import { HasherFalso } from '../support/adapter/HasherFalso.js';
import { ConexionFalsa } from '../support/ConexionFalsa.js';
import { configPrueba } from '../support/configPrueba.js';
import { crearLoggerSilencioso } from '../support/LoggerSilencioso.js';
import { DenunciaDAOMemoria } from '../support/dao/memoria/DenunciaDAOMemoria.js';
import { LugarDAOMemoria } from '../support/dao/memoria/LugarDAOMemoria.js';
import { ReporteDAOMemoria } from '../support/dao/memoria/ReporteDAOMemoria.js';
import { SancionDAOMemoria } from '../support/dao/memoria/SancionDAOMemoria.js';
import { UsuarioDAOMemoria } from '../support/dao/memoria/UsuarioDAOMemoria.js';
import { aUsuario } from '../support/fabrica/datos.js';

describe('crearModeracionFacade', () => {
  const armar = (diasPermitidos: string) => {
    const usuarioDAO = new UsuarioDAOMemoria();
    const correo = new CorreoEspia();
    const infra = construirInfraestructura({
      cfg: configPrueba({ SUSPENSION_DIAS_PERMITIDOS: diasPermitidos }),
      logger: crearLoggerSilencioso(),
      conexion: new ConexionFalsa(),
      usuarioDAO,
      lugarDAO: new LugarDAOMemoria(),
      reporteDAO: new ReporteDAOMemoria(),
      sancionDAO: new SancionDAOMemoria(),
      hasher: new HasherFalso(),
      emisorToken: new EmisorTokenFalso(),
      seguridad: { correo },
    });
    return { facade: crearModeracionFacade(infra, new DenunciaDAOMemoria()), usuarioDAO, correo };
  };

  it('suspende con los dias permitidos por la configuracion y envia el correo por el puerto inyectado', async () => {
    const { facade, usuarioDAO, correo } = armar('3,7');
    const admin = usuarioDAO.agregar(aUsuario({ rol: Rol.ADMIN }));
    const objetivo = usuarioDAO.agregar(aUsuario());
    await expect(facade.suspender(admin.id, objetivo.id, 7, 'Reportes falsos reiterados')).resolves.toMatchObject({ dias: 7 });
    expect(correo.enviados).toHaveLength(1);
  });

  it('rechaza los dias que la configuracion no permite', async () => {
    const { facade, usuarioDAO } = armar('3');
    const admin = usuarioDAO.agregar(aUsuario({ rol: Rol.ADMIN }));
    const objetivo = usuarioDAO.agregar(aUsuario());
    await expect(facade.suspender(admin.id, objetivo.id, 30, 'Reportes falsos reiterados')).rejects.toBeInstanceOf(ValidacionException);
  });
});
