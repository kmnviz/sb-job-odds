import winston from 'winston';
import {env} from '../config/env.js';

const isDevelopment = process.env.NODE_ENV === 'development';

const logger = winston.createLogger({
  levels: winston.config.npm.levels,
  level: env.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({stack: true}),
    isDevelopment
      ? winston.format.combine(
          winston.format.colorize(),
          winston.format.printf((info) => {
            const {timestamp, level, message, ...rest} = info;
            const meta = Object.keys(rest).length > 0 ? rest : {};
            const metaStr =
              Object.keys(meta).length > 0
                ? ` ${JSON.stringify(meta)}`
                : '';
            return `${timestamp} [${level}]: ${message}${metaStr}`;
          })
        )
      : winston.format.printf((info) => {
          const {timestamp, level, message, ...rest} = info;
          const meta = Object.keys(rest).length > 0 ? rest : {};
          return JSON.stringify({timestamp, level, message, meta});
        })
  ),
  transports: [new winston.transports.Console()],
});

export default logger;
