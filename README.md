
## INSTALLATION

Create and edit your .env file from the example
```bash
cp .env.example .env
```

Start the OTel Collector
```bash
docker compose up
```

### INSTALL MASTRA OTEL EXPORTER
If you receive errors when installing the `@mastra/otel-exporter`, try the `--legacy-peer-deps` flag:

```bash
npm install @mastra/otel-exporter --legacy-peer-deps
```