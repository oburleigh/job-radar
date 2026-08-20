# Context-first hexagonal modular monolith

Job Radar remains one deployable Next.js package, organised by bounded context. Each context keeps domain and application policy inside a visible `hexagon/` directory, with web, SQLite, search, and ATS code in context-owned adapters. `src/app` is the Next.js composition and delivery layer. Shared platform code is limited to technical mechanisms such as the SQLite connection, HTTP transport, environment loading, and logging; it cannot own context schemas, repositories, or product policy.

The previous global layer folders made unrelated capabilities share broad infrastructure and application namespaces. Splitting into packages now would add release and dependency overhead without a second consumer. Contexts will therefore move one tested vertical slice at a time, and a package will be extracted only when an independent consumer or deployment boundary makes that cost worthwhile.
