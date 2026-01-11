import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// model partner_conversation {
//     id String @id @default(uuid())
  
//     name             String?
//     image            String?
//     conversationType conversationType @default(Private)
  
//     partnerId String
//     partner   User   @relation(fields: [partnerId], references: [id], onDelete: Cascade)
  
//     members  partner_conversation_members[]
//     messages partner_conversation_message[]
  
//     createdAt DateTime @default(now())
//     updatedAt DateTime @updatedAt
  
//     @@index([partnerId])
//     @@index([createdAt])
//   }
  
//   enum conversationType {
//     Private
//     Group
//   }
  
//   model partner_conversation_members {
//     id String @id @default(uuid())
  
//     conversationId String
//     conversation   partner_conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  
//     // Member can be either PARTNER or EMPLOYEE
//     partnerId String?
//     partner   User?   @relation(fields: [partnerId], references: [id], onDelete: Cascade)
  
//     employeeId String?
//     employee   Employees? @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  
//     role memberRole
  
//     isPartner Boolean @default(false)
//     // isMuted Boolean @default(false)
//     // isArchived Boolean @default(false)
//     isDeleted Boolean @default(false)
  
//     joinedAt  DateTime @default(now())
//     updatedAt DateTime @updatedAt
  
//     @@unique([conversationId, partnerId, employeeId])
//     @@index([conversationId])
//     @@index([partnerId])
//     @@index([employeeId])
//   }
  
//   enum memberRole {
//     Partner
//     Employee
//   }
  
//   model partner_conversation_message {
//     id String @id @default(uuid())
  
//     conversationId String
//     conversation   partner_conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  
//     // Sender can be either PARTNER or EMPLOYEE
//     senderPartnerId String?
//     senderPartner   User?   @relation(fields: [senderPartnerId], references: [id], onDelete: SetNull)
  
//     senderEmployeeId String?
//     senderEmployee   Employees? @relation(fields: [senderEmployeeId], references: [id], onDelete: SetNull)
  
//     // For multiple replies - self-relation for chaining replies
//     repliedToMessageIds String[]
  
//     senderType messageSenderType // PARTNER or EMPLOYEE
  
//     content     String
//     messageType messageType @default(Normal)
  
//     // Message status
//     isEdited  Boolean   @default(false)
//     isDeleted Boolean   @default(false)
//     isUpdated Boolean   @default(false)
  
//     deletedAt DateTime?
  
  
//     createdAt                      DateTime                       @default(now())
//     updatedAt                      DateTime                       @updatedAt
  
//     @@index([conversationId])
//     @@index([senderPartnerId])
//     @@index([senderEmployeeId])
//     @@index([createdAt])
//   }
  
//   enum messageSenderType {
//     Partner
//     Employee
//   }
  
//   enum messageType {
//     Normal
//     System
//   }
  


export const createConversation = async (req, res) => {
    try {
        
    } catch (error) {
        console.error("Error in getOrderSettings:", error);
        return res.status(500).json({
          success: false,
          message: "Something went wrong",
          error: error?.message,
        });
    }
}