type AppSidebarNavItem = {
  href: string;
  exactMatch?: boolean;
};

const CREATE_EVENT_PATH = "/events/create";

export function isAppSidebarNavActive(item: AppSidebarNavItem, pathname: string) {
  if (pathname === item.href) {
    return true;
  }

  if (item.href === "/dashboard") {
    return false;
  }

  if (item.href === "/events" && pathname === CREATE_EVENT_PATH) {
    return false;
  }

  return item.exactMatch === false && pathname.startsWith(item.href);
}
