# Context-first DDD with ports and adapters

Job Radar stays in one deployable package. Business code is grouped by bounded context. Each context may contain `domain`, `application`, `infrastructure`, `presentation`, `composition`, and `test-support` directories when those roles have real code.

The domain and application layers are the inside of the hexagon. The application layer owns the ports used by its use cases. Infrastructure implements driven ports for SQLite, search providers, ATS protocols, HTTP, and background work. Presentation contains React components, request schemas, HTTP adapters, and React Router routes. Context composition modules select concrete adapters and inject them into use cases.

Next.js was removed because Job Radar does not need React Server Components, edge deployment, image optimization, or a fixed framework route tree. React Router and Vite keep the route map inside `src/contexts/discovery/presentation/web`; no `src/app` directory exists. This preserves server rendering and HTTP actions without turning a framework convention into an architectural layer.

`hexagon` is a dependency boundary, not a directory. The source tree does not use `hexagon`, `adapters/driving`, or `adapters/driven` folders. Architecture tests enforce the dependency direction instead.

Shared platform code is limited to context-neutral mechanisms such as the SQLite client and local-request checks. It cannot own a context schema, repository, read model, or product policy. A package will be extracted only when an independent consumer or deployment boundary exists.

Application commands and results are provider-free DTOs colocated with their use case. Zod request schemas live at the web boundary, while vendor and persistence schemas live with infrastructure adapters. Global DTO, schema, and type buckets are not used.
