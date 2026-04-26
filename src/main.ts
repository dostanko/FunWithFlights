import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { TypedConfigService } from './config/typed-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Buffer early framework logs until pino is wired up below, otherwise
    // they bypass our logger and break JSON consistency in production.
    bufferLogs: true,
  });

  // Route every framework log line through pino too.
  app.useLogger(app.get(Logger));

  // Strip unknown fields and coerce DTO types. We don't use
  // `forbidNonWhitelisted` — clients sometimes pass extra query hints
  // (e.g. `?utm_source=...`); `whitelist` already keeps them out of handlers.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('FunWithFlights — Routes API')
    .setDescription('Aggregated flight routes from multiple providers.')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Graceful shutdown for ECS rolling deploys (SIGTERM from Fargate).
  app.enableShutdownHooks();

  const cfg = app.get(TypedConfigService);
  const port = cfg.port;
  await app.listen(port, '0.0.0.0');
  app.get(Logger).log(`Application listening on :${port} (OpenAPI at /api)`, 'Bootstrap');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to bootstrap application', err);
  process.exit(1);
});
