import 'server-only';

export async function hasRequestBody(request) {
  // Next.js can supply a stream even for a POST with zero bytes.
  const reader = request.body?.getReader();
  if (!reader) return false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return false;
      if (value.byteLength > 0) {
        // Reject on the first bytes without buffering an arbitrary payload.
        await reader.cancel();
        return true;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
