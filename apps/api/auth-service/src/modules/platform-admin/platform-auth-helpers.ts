
const ok = <T>(data: T) => ({ success: true, data });

const fail = (message: string, statusCode = 400) => ({ success: false, statusCode, message });

export { ok, fail };
