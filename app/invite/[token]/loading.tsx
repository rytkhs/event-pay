import { Card } from "@/components/ui/card";

export default function InviteLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 text-center">
          <div className="h-8 bg-gray-200 rounded animate-pulse mb-2"></div>
          <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3 mx-auto"></div>
        </div>

        <Card className="p-6">
          <div className="space-y-6">
            <div>
              <div className="h-6 bg-gray-200 rounded animate-pulse mb-2"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse w-1/3"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i}>
                    <div className="h-4 bg-gray-200 rounded animate-pulse mb-1"></div>
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3"></div>
                  </div>
                ))}
              </div>
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i}>
                    <div className="h-4 bg-gray-200 rounded animate-pulse mb-1"></div>
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3"></div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="h-4 bg-gray-200 rounded animate-pulse mb-2"></div>
              <div className="h-16 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>
        </Card>

        <div className="text-center mt-6">
          <div className="h-12 bg-gray-200 rounded animate-pulse w-48 mx-auto"></div>
        </div>
      </div>
    </div>
  );
}
