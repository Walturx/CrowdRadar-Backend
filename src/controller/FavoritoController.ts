import type { RequestHandler } from 'express';
import type {
  AgregarFavoritoRequestDTO,
  ConfigurarAlertasRequestDTO,
  FavoritoLugarParamsDTO,
} from '../dto/request/favorito/FavoritoRequestDTO.js';
import { respuesta } from '../dto/RespuestaDTO.js';
import { FavoritoMapper, MENSAJE_ALERTAS_ACTUALIZADAS, MENSAJE_FAVORITO_AGREGADO } from '../mapper/FavoritoMapper.js';
import type { FavoritoService } from '../service/FavoritoService.js';

/** HTTP adapter of FavoritoService; `req.usuario` is set by `autenticar`, body and params by `validar`. */
export class FavoritoController {
  constructor(private readonly favoritoService: FavoritoService) {}

  listar: RequestHandler = async (req, res) => {
    const favoritos = await this.favoritoService.listar(req.usuario!.id);
    res.status(200).json(respuesta(FavoritoMapper.mensajeLista(favoritos), FavoritoMapper.aLista(favoritos)));
  };

  agregar: RequestHandler = async (req, res) => {
    const { lugarId } = req.body as AgregarFavoritoRequestDTO;
    const favorito = await this.favoritoService.agregar(req.usuario!.id, lugarId);
    res.status(201).json(respuesta(MENSAJE_FAVORITO_AGREGADO, FavoritoMapper.aResponse(favorito)));
  };

  eliminar: RequestHandler = async (req, res) => {
    const { lugarId } = res.locals.params as FavoritoLugarParamsDTO;
    await this.favoritoService.eliminar(req.usuario!.id, lugarId);
    res.status(204).end();
  };

  configurarAlertas: RequestHandler = async (req, res) => {
    const { lugarId } = res.locals.params as FavoritoLugarParamsDTO;
    const { alertasActivadas } = req.body as ConfigurarAlertasRequestDTO;
    const favorito = await this.favoritoService.configurarAlertas(req.usuario!.id, lugarId, alertasActivadas);
    res.status(200).json(respuesta(MENSAJE_ALERTAS_ACTUALIZADAS, FavoritoMapper.aResponse(favorito)));
  };
}
