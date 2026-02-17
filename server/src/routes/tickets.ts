import { Router } from "express";
import { z } from "zod";
import { TicketAuthorType, TicketStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { readAuthIfPresent } from "../middleware/readAuthIfPresent";
import { assertNoBlockedContent } from "../services/contentModeration";
import { publish } from "../services/events";

const router = Router();

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const createTicketSchema = z.object({
  subject: z.preprocess(emptyToUndefined, z.string().min(3).max(150).optional()),
  message: z.preprocess(emptyToUndefined, z.string().max(5000).optional()),
  details: z.preprocess(emptyToUndefined, z.string().max(5000).optional()),
  description: z.preprocess(emptyToUndefined, z.string().max(5000).optional()),
  text: z.preprocess(emptyToUndefined, z.string().max(5000).optional()),
  reporterEmail: z.preprocess(emptyToUndefined, z.string().email().optional()),
  email: z.preprocess(emptyToUndefined, z.string().email().optional())
});

const ticketMessageSchema = z.object({
  body: z.string().min(1).max(5000)
});

router.post("/", readAuthIfPresent, validate(createTicketSchema), async (req, res) => {
  const subject = req.body.subject || "Support request";
  const body = req.body.message || req.body.details || req.body.description || req.body.text;
  const reporterEmail = req.body.reporterEmail || req.body.email;

  if (!body || body.trim().length < 3) {
    return res.status(400).json({ error: "message is required", requestId: req.requestId });
  }
  if (!req.authUser && !reporterEmail) {
    return res.status(400).json({ error: "reporterEmail is required for guest tickets", requestId: req.requestId });
  }

  assertNoBlockedContent([
    { name: "subject", value: subject },
    { name: "body", value: body }
  ]);

  const ticket = await prisma.ticket.create({
    data: {
      subject,
      userId: req.authUser?.id,
      reporterEmail: req.authUser ? undefined : reporterEmail,
      messages: {
        create: {
          authorType: req.authUser ? TicketAuthorType.USER : TicketAuthorType.USER,
          authorId: req.authUser?.id,
          body
        }
      }
    },
    include: {
      messages: { orderBy: { createdAt: "asc" } }
    }
  });
  publish({
    type: "TICKET_CREATED",
    correlationId: req.requestId,
    payload: {
      ticketId: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      createdByUserId: ticket.userId
    }
  });

  return res.status(201).json(ticket);
});

router.get("/", requireAuth, async (req, res) => {
  const isStaff = req.authUser!.role !== "USER";
  const where = isStaff ? {} : { userId: req.authUser!.id };
  const tickets = await prisma.ticket.findMany({
    where,
    include: {
      user: { select: { id: true, email: true, role: true } },
      assignedTo: { select: { id: true, email: true, role: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, email: true, role: true } } }
      }
    },
    orderBy: { updatedAt: "desc" }
  });
  return res.json(tickets);
});

router.post("/:id/messages", requireAuth, validate(ticketMessageSchema), async (req, res) => {
  const ticket = await prisma.ticket.findUnique({ where: { id: String(req.params.id) } });
  if (!ticket) {
    return res.status(404).json({ error: "Ticket not found", requestId: req.requestId });
  }
  const isStaff = req.authUser!.role !== "USER";
  if (!isStaff && ticket.userId !== req.authUser!.id) {
    return res.status(403).json({ error: "Cannot write to this ticket", requestId: req.requestId });
  }

  assertNoBlockedContent([{ name: "body", value: req.body.body }]);
  const msg = await prisma.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      authorType: isStaff ? TicketAuthorType.STAFF : TicketAuthorType.USER,
      authorId: req.authUser!.id,
      body: req.body.body
    }
  });

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: isStaff ? TicketStatus.IN_PROGRESS : ticket.status }
  });
  publish({
    type: "TICKET_UPDATED",
    correlationId: req.requestId,
    payload: {
      ticketId: ticket.id,
      action: "MESSAGE_ADDED",
      messageId: msg.id,
      authorType: msg.authorType,
      status: isStaff ? TicketStatus.IN_PROGRESS : ticket.status
    }
  });

  return res.status(201).json(msg);
});

export default router;
