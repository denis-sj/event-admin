import { type ZodTypeAny } from 'zod';
import type { Request, Response, NextFunction } from 'express';

export const validate =
  (schema: ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      }) as any;

      // Optionally overwrite the request object with parsed values
      req.body = parsed.body;
      Object.defineProperty(req, 'query', { value: parsed.query, enumerable: true });
      Object.defineProperty(req, 'params', { value: parsed.params, enumerable: true });

      next();
    } catch (error) {
      next(error);
    }
  };
