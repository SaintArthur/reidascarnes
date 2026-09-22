/* Service Worker — recebe notificações via Web Push, mesmo com a aba fechada */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = { title: 'Rei das Carnes', body: 'Você tem uma notificação.' };
  try { data = event.data.json(); } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title || 'Rei das Carnes', {
      body: data.body || '',
      tag: data.appointmentId ? `appointment-${data.appointmentId}` : undefined,
      data: { appointmentId: data.appointmentId },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return self.clients.openWindow('/');
    })
  );
});
