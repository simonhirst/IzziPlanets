const bootstrap = () => import("./modules/app-runtime");

if (typeof window !== "undefined" && "requestIdleCallback" in window) {
  window.requestIdleCallback(() => {
    bootstrap();
  });
} else {
  setTimeout(() => {
    bootstrap();
  }, 0);
}
