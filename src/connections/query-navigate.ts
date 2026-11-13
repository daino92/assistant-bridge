/**
 * Adapts a router's `navigate(url)` to the `navigate(path, params)` shape used by
 * `navigateAction` and `AssistantHost`. `baseQuery` keeps host state such as the
 * current environment and always wins: `params` (already validated by the action) cannot
 * override it.
 * Values are encoded with `URLSearchParams`; `undefined` and `null` values are dropped.
 */
export const queryNavigate =
  <TResult>(navigate: (url: string) => TResult, baseQuery: Readonly<Record<string, string>> = {}) =>
  (path: string, params?: Readonly<Record<string, unknown>>): TResult => {
    const query = new URLSearchParams(baseQuery);

    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined && value !== null && !Object.hasOwn(baseQuery, key)) {
        query.set(key, String(value));
      }
    }

    const search = query.toString();

    return navigate(search ? `${path}?${search}` : path);
  };
