# Attribution and included material

Original patcher, extension, tests and suite integration:
**Copyright (c) 2026 davoda1**, MIT; see `LICENSE`.

The extension integrates with and reuses interfaces and behavior from
[ThreadShelf](https://github.com/ChrystianSchutz/ThreadShelf),
**Copyright (c) 2026 Chrystian Schutz**, MIT. The reviewed new baseline is tag
`v1.4.1`, commit `d8e59473e465180fcdd7d690cfb61b35c00a6efe`.
The upstream license is reproduced in `ThreadShelf-LICENSE.txt`. The reviewable
diff retains small upstream context passages; the full upstream server is not
redistributed in this directory.

The original 1.3.0 installer, payload and source fingerprints are retained under `1.3.0/`, including
its original license, attribution, source fingerprints and historical validation.
Its upstream baseline is tag `v1.3.0`, commit
`3430dd04f50218fdea916b104709d24a651017fc`.

The installed server supplies Express, LanceDB, the embedding pipeline and
their dependencies under their own licenses. This patch adds no runtime
dependency and does not redistribute model weights or dependency binaries.
Consult upstream's lockfile and notices when distributing a built server.

ThreadShelf Local Suite is an independent companion project. This patch is not
an official ThreadShelf release and implies no upstream endorsement.
