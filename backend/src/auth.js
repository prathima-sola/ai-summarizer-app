function createRequireAuth(supabaseAdmin) {
  return async function requireAuth(req, res, next) {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'The document workspace has not been configured.' });
    }

    const authorization = req.get('authorization') || '';
    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Sign in to access this document.' });
    }

    try {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !data.user) {
        return res.status(401).json({ error: 'Your session expired. Sign in again.' });
      }

      req.user = data.user;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { createRequireAuth };
