// libuv reads UV_THREADPOOL_SIZE lazily on its first work submission (async fs/dns/zlib) and
// caches it for the process lifetime — so this must run before anything else touches the
// filesystem asynchronously. Import this as the very first import in the entry file: ES module
// imports evaluate in declaration order, so as long as this stays first, later modules (which do
// perform async fs work at startup) still see the raised pool size. The default of 4 serializes
// most of the concurrency session-discovery relies on to scan 1000+ transcript files quickly.
if (!process.env.UV_THREADPOOL_SIZE) {
  process.env.UV_THREADPOOL_SIZE = '32'
}
