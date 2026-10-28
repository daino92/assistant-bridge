import type { HostContext } from '@/contracts';

export interface HostEntityMapping<T> {
  type: string;
  id: (item: T) => string;
  label: (item: T) => string;
  reference?: (item: T) => string | undefined;
  aliases?: (item: T) => readonly string[] | undefined;
  attributes?: (item: T) => Readonly<Record<string, string>> | undefined;
}

/** Publishes only explicit host-selected summaries, never the source business object. */
export const mapHostEntities = <T>(
  items: readonly T[],
  mapping: HostEntityMapping<T>,
): NonNullable<HostContext['entities']> =>
  items.map((item) => {
    const reference = mapping.reference?.(item);
    const aliases = mapping.aliases?.(item);
    const attributes = mapping.attributes?.(item);

    return {
      type: mapping.type,
      id: mapping.id(item),
      label: mapping.label(item),
      ...(reference !== undefined ? { reference } : {}),
      ...(aliases !== undefined ? { aliases: [...aliases] } : {}),
      ...(attributes !== undefined ? { attributes: { ...attributes } } : {}),
    };
  });
