type RecentItem = {
  updatedAt: string;
  upcoming?: boolean;
};

export function sortItemByRecent<T extends RecentItem[]>(items: T): Array<T[number]> {
  return [...items].sort((a, b) => {
    // Upcoming items first
    if (a.upcoming && !b.upcoming) return -1;
    if (!a.upcoming && b.upcoming) return 1;

    // Then sort by updatedAt (most recent first)
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}
