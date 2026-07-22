import Link from 'next/link';

export function LotPagination({
  searchParams,
  nextCursor,
}: {
  searchParams: Record<string, string | undefined>;
  nextCursor?: string;
}) {
  if (!nextCursor) return null;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value && key !== 'cursor') params.set(key, value);
  }
  params.set('cursor', nextCursor);

  return (
    <div className="flex justify-end">
      <Link
        href={`/lots?${params.toString()}`}
        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
      >
        Следующая страница
      </Link>
    </div>
  );
}
