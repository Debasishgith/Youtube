import SearchResult from "@/components/ui/SearchResults";
import { Suspense } from "react";

type SearchPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

const SearchPage = async ({ searchParams }: SearchPageProps) => {
  const params = await searchParams;
  const query = Array.isArray(params.q) ? params.q[0] : params.q;

  return (
    <div className="flex-1 p-4">
      <div className="max-w-6xl">
        {query && (
          <div className="mb-6">
            <h1 className="text-xl font-medium mb-4">
              Search results for "{query}"
            </h1>
          </div>
        )}
        <Suspense fallback={<div>Loading search results...</div>}>
          <SearchResult query={query || ""} />
        </Suspense>
      </div>
    </div>
  );
};

export default SearchPage;
