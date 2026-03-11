const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Reset order 1005
  const updated = await p.customerOrders.updateMany({
    where: { id: '443b62c7-f809-4769-94e8-ecd14343a90b' },
    data: { bezahlt: 'Privat_offen', orderStatus: 'Abholbereit_Versandt' }
  });
  console.log('Order 1005 reset:', updated.count, 'row(s)');

  // Delete its receipt if exists
  const deleted = await p.pos_receipt.deleteMany({
    where: { orderId: '443b62c7-f809-4769-94e8-ecd14343a90b' }
  });
  console.log('Receipt deleted:', deleted.count, 'row(s)');

  // Also reset order 1007
  const updated2 = await p.customerOrders.updateMany({
    where: { id: '396d1156-4b0d-4140-8ccd-e7fc7f918723' },
    data: { bezahlt: 'Privat_offen', orderStatus: 'Abholbereit_Versandt' }
  });
  console.log('Order 1007 reset:', updated2.count, 'row(s)');

  const deleted2 = await p.pos_receipt.deleteMany({
    where: { orderId: '396d1156-4b0d-4140-8ccd-e7fc7f918723' }
  });
  console.log('Receipt deleted:', deleted2.count, 'row(s)');

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
