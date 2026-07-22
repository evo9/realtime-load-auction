interface LotPageProps {
  params: Promise<{ id: string }>;
}

export default async function LotPage({ params }: LotPageProps) {
  const { id } = await params;
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Лот {id}
      </h1>
      <p className="mt-2 text-zinc-500">Живая страница лота появится в M5-03.</p>
    </div>
  );
}
