/* Native Debian entry point. The actual Electron binary remains beside its
 * runtime resources under /opt. No shell, environment rewrite, or script runs.
 * Build statically to avoid introducing a newer glibc dependency. */
#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

#ifndef THREADSHELF_EXECUTABLE
#error THREADSHELF_EXECUTABLE must name the installed absolute runtime path
#endif

int main(int argc, char **argv) {
    (void)argc;
    execv(THREADSHELF_EXECUTABLE, argv);
    const int failure = errno;
    fprintf(stderr, "Cannot start " THREADSHELF_EXECUTABLE ": %s\n", strerror(failure));
    return failure == ENOENT ? 127 : 126;
}
