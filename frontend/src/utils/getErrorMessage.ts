interface ApiErrorResponse {
  response?: { data?: { message?: string } };
  message?: string;
}

// Every catch block in this app follows the same shape: prefer the server's
// message, fall back to the JS error message, then a caller-supplied default.
export function getErrorMessage(err: unknown, fallback: string): string {
  const apiErr = err as ApiErrorResponse;
  return apiErr?.response?.data?.message || apiErr?.message || fallback;
}
