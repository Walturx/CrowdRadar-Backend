import type { RequestHandler } from 'express';
import type { Rol } from '../enum/Rol.js';
import { CodigoError } from '../exception/CodigoError.js';
import { AccesoDenegadoException } from '../exception/base/AccesoDenegadoException.js';
import { NoAutenticadoException } from '../exception/base/NoAutenticadoException.js';

/** Role guard; must run after `autenticar`. 403 ACCESO_DENEGADO when the role differs. */
export const requerirRol =
  (rol: Rol): RequestHandler =>
  (req, _res, next) => {
    if (!req.usuario) {
      throw new NoAutenticadoException(CodigoError.NO_AUTENTICADO, 'Debes iniciar sesión para continuar.');
    }
    if (req.usuario.rol !== rol) throw new AccesoDenegadoException();
    next();
  };
