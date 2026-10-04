import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

const validateSchema = (schema: ZodType) => (req: Request, res: Response, next: NextFunction) => {
  const resultado = schema.safeParse(req.body);

  if (!resultado.success) {
    return res.status(400).json({
      message: 'Datos inválidos.',
      errors: resultado.error.issues.map((issue) => ({
        campo: issue.code === 'unrecognized_keys' ? issue.keys.join(',') : issue.path.join('.'),
        mensaje: issue.message,
      })),
    });
  }

  req.body = resultado.data;
  next();
};

export default validateSchema;
