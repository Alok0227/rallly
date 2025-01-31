import { APIRequestContext, expect, test } from "@playwright/test";
import { Prisma, prisma } from "@rallly/database";
import dayjs from "dayjs";

/**
 * House keeping policy:
 * * Demo polls are hard deleted after one day
 * * Polls are soft deleted after 30 days of inactivity
 * * Soft deleted polls are hard deleted after 7 days of being soft deleted
 */
test.describe("house keeping", () => {
  const callHouseKeeping = async (
    request: APIRequestContext,
    baseURL?: string,
  ) => {
    const res = await request.post(`${baseURL}/api/house-keeping`, {
      headers: {
        Authorization: `Bearer ${process.env.API_SECRET}`,
      },
    });
    return res;
  };
  test.beforeAll(async ({ request, baseURL }) => {
    // call the endpoint to delete any existing data that needs to be removed
    await callHouseKeeping(request, baseURL);
    await seedData();
    const res = await callHouseKeeping(request, baseURL);
    expect(await res.json()).toMatchObject({
      softDeleted: 1,
      deleted: 2,
    });
  });

  test("should keep active polls", async () => {
    const poll = await prisma.poll.findUnique({
      where: {
        id: "active-poll",
      },
    });

    // expect active poll to not be deleted
    expect(poll).not.toBeNull();
    expect(poll?.deleted).toBeFalsy();
  });

  test("should keep polls that have been soft deleted for less than 7 days", async () => {
    const deletedPoll6d = await prisma.poll.findFirst({
      where: {
        id: "deleted-poll-6d",
        deleted: true,
      },
    });

    // expect a poll that has been deleted for 6 days to
    expect(deletedPoll6d).not.toBeNull();
  });

  test("should hard delete polls that have been soft deleted for 7 days", async () => {
    const deletedPoll7d = await prisma.poll.findFirst({
      where: {
        id: "deleted-poll-7d",
        deleted: true,
      },
    });

    expect(deletedPoll7d).toBeNull();

    const participants = await prisma.participant.findMany({
      where: {
        pollId: "deleted-poll-7d",
      },
    });

    expect(participants.length).toBe(0);

    const votes = await prisma.vote.findMany({
      where: {
        pollId: "deleted-poll-7d",
      },
    });

    expect(votes.length).toBe(0);

    const options = await prisma.option.findMany({
      where: {
        pollId: "deleted-poll-7d",
      },
    });

    expect(options.length).toBe(0);
  });

  test("should keep polls that are still active", async () => {
    const stillActivePoll = await prisma.poll.findUnique({
      where: {
        id: "still-active-poll",
      },
    });

    expect(stillActivePoll).not.toBeNull();
    expect(stillActivePoll?.deleted).toBeFalsy();
  });

  test("should soft delete polls that are inactive", async () => {
    const inactivePoll = await prisma.poll.findFirst({
      where: {
        id: "inactive-poll",
        deleted: true,
      },
    });

    expect(inactivePoll).not.toBeNull();
    expect(inactivePoll?.deleted).toBeTruthy();
    expect(inactivePoll?.deletedAt).toBeTruthy();
  });

  test("should keep new demo poll", async () => {
    const demoPoll = await prisma.poll.findFirst({
      where: {
        id: "demo-poll-new",
      },
    });

    expect(demoPoll).not.toBeNull();
  });

  test("should delete old demo poll", async () => {
    const oldDemoPoll = await prisma.poll.findFirst({
      where: {
        id: "demo-poll-old",
      },
    });

    expect(oldDemoPoll).toBeNull();
  });

  test("should not delete poll that has options in the future", async () => {
    const futureOptionPoll = await prisma.poll.findFirst({
      where: {
        id: "inactive-poll-future-option",
      },
    });

    expect(futureOptionPoll).not.toBeNull();
  });

  // Teardown
  test.afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM polls WHERE id IN (${Prisma.join([
      "active-poll",
      "deleted-poll-6d",
      "deleted-poll-7d",
      "still-active-poll",
      "inactive-poll",
      "inactive-poll-future-option",
      "demo-poll-new",
      "demo-poll-old",
    ])})`;
    await prisma.$executeRaw`DELETE FROM options WHERE id IN (${Prisma.join([
      "option-1",
      "option-2",
      "option-3",
      "option-4",
      "option-5",
    ])})`;
    await prisma.$executeRaw`DELETE FROM participants WHERE id IN (${Prisma.join(
      ["participant-1"],
    )})`;
  });
});

const seedData = async () => {
  await prisma.poll.createMany({
    data: [
      // Active Poll
      {
        title: "Active Poll",
        id: "active-poll",
        userId: "user1",
        participantUrlId: "p1",
        adminUrlId: "a1",
      },
      // Poll that has been deleted 6 days ago
      {
        title: "Deleted poll",
        id: "deleted-poll-6d",
        userId: "user1",
        deleted: true,
        deletedAt: dayjs().add(-6, "days").toDate(),
        participantUrlId: "p2",
        adminUrlId: "a2",
      },
      // Poll that has been deleted 7 days ago
      {
        title: "Deleted poll 7d",
        id: "deleted-poll-7d",
        userId: "user1",
        deleted: true,
        deletedAt: dayjs().add(-7, "days").toDate(),
        participantUrlId: "p3",
        adminUrlId: "a3",
      },
      // Poll that has been inactive for 29 days
      {
        title: "Still active",
        id: "still-active-poll",
        userId: "user1",
        touchedAt: dayjs().add(-29, "days").toDate(),
        participantUrlId: "p4",
        adminUrlId: "a4",
      },
      // Poll that has been inactive for 30 days
      {
        title: "Inactive poll",
        id: "inactive-poll",
        userId: "user1",
        touchedAt: dayjs().add(-30, "days").toDate(),
        participantUrlId: "p5",
        adminUrlId: "a5",
      },
      // Demo poll
      {
        demo: true,
        title: "Demo poll",
        id: "demo-poll-new",
        userId: "user1",
        createdAt: new Date(),
        participantUrlId: "p6",
        adminUrlId: "a6",
      },
      {
        demo: true,
        title: "Old demo poll",
        id: "demo-poll-old",
        userId: "user1",
        createdAt: dayjs().add(-2, "days").toDate(),
        participantUrlId: "p7",
        adminUrlId: "a7",
      },
      {
        title: "Inactive poll with future option",
        id: "inactive-poll-future-option",
        userId: "user1",
        touchedAt: dayjs().add(-30, "days").toDate(),
        participantUrlId: "p8",
        adminUrlId: "a8",
      },
    ],
  });

  await prisma.option.createMany({
    data: [
      {
        id: "option-1",
        start: new Date("2022-02-22T00:00:00"),
        pollId: "deleted-poll-7d",
      },
      {
        id: "option-2",
        start: new Date("2022-02-23T00:00:00"),
        pollId: "deleted-poll-7d",
      },
      {
        id: "option-3",
        start: new Date("2022-02-24T00:00:00"),
        pollId: "deleted-poll-7d",
      },
      {
        id: "option-4",
        start: dayjs().add(10, "days").toDate(),
        pollId: "inactive-poll-future-option",
      },
      {
        id: "option-5",
        start: dayjs().add(-1, "days").toDate(),
        pollId: "inactive-poll",
      },
    ],
  });

  await prisma.participant.create({
    data: { id: "participant-1", name: "Luke", pollId: "deleted-poll-7d" },
  });

  await prisma.vote.createMany({
    data: [
      {
        optionId: "option-1",
        type: "yes",
        participantId: "participant-1",
        pollId: "deleted-poll-7d",
      },
      {
        optionId: "option-2",
        type: "no",
        participantId: "participant-1",
        pollId: "deleted-poll-7d",
      },
      {
        optionId: "option-3",
        type: "yes",
        participantId: "participant-1",
        pollId: "deleted-poll-7d",
      },
    ],
  });
};
