import { buildApp } from './app.ts'
import { env } from './env.ts'
import { getActiveGraph } from './services.ts'

const app = buildApp()

getActiveGraph()
  .then((a) =>
    app.log.info(
      a
        ? `active snapshot ${a.snapshotId} loaded: ${a.graph.n} nodes, ${a.graph.edgeCount} edges`
        : 'no active snapshot — run the crawler first',
    ),
  )
  .catch((err) => app.log.error(err))

app.listen({ port: env.port, host: env.host }).catch((err) => {
  app.log.error(err)
  process.exit(1)
})
