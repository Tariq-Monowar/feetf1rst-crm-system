model store_location {
  id String @id @default(uuid())

  partnerId String?
  partner   User?   @relation(fields: [partnerId], references: [id], onDelete: Cascade)

  isPrimary Boolean @default(false)

  address     String?
  description String?

  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt
  
  customerSettings    customer_settings? @relation(fields: [customer_settingsId], references: [id])
  customer_settingsId String?

  @@index([partnerId])
  @@index([createdAt])
  @@index([updatedAt])
  @@index([id])
}


model order_settings {
  id        Int      @id @default(autoincrement())
  updatedAt DateTime @updatedAt

  // 1
  autoCalcPelottePos Boolean @default(true)

  // 2
  autoSendToProd Boolean @default(false)

  // 3 - attach scans to order
  attachFootScans Boolean @default(true)

  // 4 - include basic meas. points 10+11
  showMeasPoints10_11 Boolean @default(false)

  // 5 - actually print the foot scans
  printFootScans Boolean @default(true)

  // 6 - detailed / extended meas. points 10+11
  showMeasPoints10_11_Det Boolean @default(false)

  // 7 - when orser is created this time i should create appomnent or not
  order_creation_appomnent Boolean @default(true)

  // true  → Auftragssteller übernimmt Abholung (customer/requester picks up)
  // false → Tester Mitarbeiter pro Standort (fixed tester employee per location)
  pickupAssignmentMode Boolean @default(true)

  // 8 - appomnent overlap
  appomnentOverlap Boolean @default(false)

  // 9 - we should loock worke time (employee availability)
  lookWorkTime Boolean @default(true)

  shipping_addresses_for_kv Json?

  // 10 - insole pikup deat line
  isInsolePickupDateLine Boolean @default(false)
  insolePickupDateLine   Int?

  // Optional: multi-company support
  partnerId String? @unique
  partner   User?   @relation(fields: [partnerId], references: [id], onDelete: SetNull)

  @@index([partnerId])
  @@index([updatedAt])
  @@map("order_settings")
}


model Employees {
  id String @id @default(uuid())

  accountName String

  employeeName    String
  email           String?
  password        String?
  financialAccess Boolean @default(false)
  jobPosition     String?
  image           String?
  role            Role    @default(EMPLOYEE)

  partnerId String
  user      User   @relation(fields: [partnerId], references: [id], onDelete: SetNull)

  WorkshopNote WorkshopNote?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  appointmentEmployees        AppointmentEmployee[]
  massschuheOrders            massschuhe_order[]
  customerOrdersHistories     customerOrdersHistory[]
  massschuheOrderHistories    massschuhe_order_history[]
  customerOrders              customerOrders[]
  partnerConversationMembers  partner_conversation_members[]
  partnerConversationMessages partner_conversation_message[]
  employeeFeatureAccess       employee_feature_access[]
  leave_application           leave_application[]
  shoeOrders                  shoe_order[]
  posReceipts                 pos_receipt[]
  workHours                   work_hours[]
  shoeOrderSteps              shoe_order_step[]
  workTypes                   work_types[]
  timelineAnalytics           timeline_analytics[]
  employeeAvailabilities      employee_availability[]
  appomnentRooms              appomnent_room[]

  @@index([partnerId]) // createOrder: find first employee by partner
  @@index([createdAt])
}
