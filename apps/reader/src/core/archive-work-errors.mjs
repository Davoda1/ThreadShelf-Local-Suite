const safeCode = value => typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(value) ? value : undefined;

// Structured-clone of Error does not reliably retain custom system error codes.
// Disk-full errors must remain fatal to the enclosing import operation.
export function serializeArchiveWorkerError(error) {
  let code = safeCode(error?.code), cause = error?.cause;
  for (let depth = 0; cause && depth < 8; depth++, cause = cause.cause) {
    if (cause.code === 'ENOSPC') { code = 'ENOSPC'; break; }
  }
  return { message: String(error?.message || error), name: String(error?.name || 'Error'), ...(code ? { code } : {}) };
}

export function restoreArchiveWorkerError(value) {
  const error = new Error(String(value?.message || 'Archive worker failed.'));
  error.name = String(value?.name || 'Error');
  const code = safeCode(value?.code); if (code) error.code = code;
  return error;
}
