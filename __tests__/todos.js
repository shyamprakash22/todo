/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
const request = require("supertest");
var cheerio = require("cheerio");
const db = require("../models/index");
const app = require("../app");

let server, agent, latestTodo;
function extractCsrfToken(res) {
  var $ = cheerio.load(res.text);
  return $("[name=_csrf]").val();
}

const login = async (agent, username, password) => {
  let res = await agent.get("/login");
  let csrfToken = extractCsrfToken(res);
  res = await agent.post("/session").send({
    email: username,
    password: password,
    _csrf: csrfToken,
  });
};

describe("Todo test suite", () => {
  beforeAll(async () => {
    await db.sequelize.sync({ force: true });
    server = app.listen(3000, () => {});
    agent = request.agent(server);
  });
  afterAll(async () => {
    await db.sequelize.close();
    server.close();
  });

  test("Sign up", async () => {
    // signup user A
    let res = await agent.get("/signup");
    let csrfToken = extractCsrfToken(res);
    res = await agent.post("/users").send({
      firstName: "Test",
      lastName: "User A",
      email: "userA@gmail.com",
      password: "1234",
      _csrf: csrfToken,
    });
    expect(res.statusCode).toBe(302);

    // signup user B
    res = await agent.get("/signup");
    csrfToken = extractCsrfToken(res);
    res = await agent.post("/users").send({
      firstName: "Test",
      lastName: "User B",
      email: "userB@gmail.com",
      password: "1234",
      _csrf: csrfToken,
    });
    expect(res.statusCode).toBe(302);
  });

  test("sign out", async () => {
    let res = await agent.get("/todos");
    expect(res.statusCode).toBe(200);
    res = await agent.get("/signout");
    expect(res.statusCode).toBe(302);
    res = await agent.get("/todos");
    expect(res.statusCode).toBe(302);
  });

  test("creating a new todo", async () => {
    const agent = request.agent(server);
    await login(agent, "userA@gmail.com", "1234");
    const res = await agent.get("/todos");
    const csrfToken = extractCsrfToken(res);
    const response = await agent.post("/todos").send({
      title: "Buy milk",
      dueDate: new Date().toISOString(),
      completed: false,
      _csrf: csrfToken,
    });

    expect(response.statusCode).toBe(302);
  });

  test("mark a todo as complete", async () => {
    const agent = request.agent(server);
    await login(agent, "userA@gmail.com", "1234");
    let res = await agent.get("/todos");
    let csrfToken = extractCsrfToken(res);
    await agent.post("/todos").send({
      title: "Buy milk",
      dueDate: new Date().toISOString(),
      completed: false,
      _csrf: csrfToken,
    });

    const groupedTodosResponse = await agent
      .get("/todos")
      .set("Accept", "application/json");
    const parsedGroupedResponse = JSON.parse(groupedTodosResponse.text);
    const dueTodayCount = parsedGroupedResponse.dueToday.length;
    const latestTodo = parsedGroupedResponse.dueToday[dueTodayCount - 1];

    res = await agent.get("/todos");
    csrfToken = extractCsrfToken(res);

    const markCompleteResponse = await agent
      .put(`/todos/${latestTodo.id}`)
      .send({
        _csrf: csrfToken,
        completed: true,
      });

    const parsedUpdateResponse = JSON.parse(markCompleteResponse.text);
    expect(parsedUpdateResponse.completed).toBe(true);
  });

  test("marking an item as incomplete", async () => {
    const agent = request.agent(server);
    await login(agent, "userA@gmail.com", "1234");
    let res = await agent.get("/todos");
    let csrfToken = extractCsrfToken(res);

    await agent.post("/todos").send({
      title: "Buy shampoo",
      dueDate: new Date().toISOString(),
      completed: false,
      _csrf: csrfToken,
    });

    const groupedTodosResponse = await agent
      .get("/todos")
      .set("Accept", "application/json");
    const parsedGroupedResponse = JSON.parse(groupedTodosResponse.text);
    const dueTodayCount = parsedGroupedResponse.dueToday.length;
    const latestTodo = parsedGroupedResponse.dueToday[dueTodayCount - 1];

    res = await agent.get("/todos");
    csrfToken = extractCsrfToken(res);

    const markCompleteResponse = await agent
      .put(`/todos/${latestTodo.id}`)
      .send({
        _csrf: csrfToken,
        completed: true,
      });

    const parsedmarkCompleteResponse = JSON.parse(markCompleteResponse.text);
    expect(parsedmarkCompleteResponse.completed).toBe(true);

    // eslint-disable-next-line no-unused-vars
    const markInCompleteResponse = await agent
      .put(`/todos/${latestTodo.id}`)
      .send({
        _csrf: csrfToken,
        completed: false,
      });

    const groupedTodosResponseInComplete = await agent
      .get("/todos")
      .set("Accept", "application/json");
    const parsedGroupedResponseInComplete = JSON.parse(
      groupedTodosResponseInComplete.text
    );
    const dueTodayCountCompletedInComplete =
      parsedGroupedResponseInComplete.dueToday.length;

    expect(dueTodayCount - 1).toBe(dueTodayCountCompletedInComplete);
  });

  test("deleting a todo", async () => {
    const agent = request.agent(server);
    await login(agent, "userA@gmail.com", "1234");
    let res = await agent.get("/todos");
    let csrfToken = extractCsrfToken(res);
    await agent.post("/todos").send({
      _csrf: csrfToken,
      title: "Buy Milk",
      dueDate: new Date().toDateString(),
      completed: false,
    });

    const groupedTodosResponse = await agent
      .get("/todos")
      .set("Accept", "application/json");
    const parsedGroupedResponse = JSON.parse(groupedTodosResponse.text);

    expect(parsedGroupedResponse.dueToday).toBeDefined();

    const dueTodayCount = parsedGroupedResponse.dueToday.length;
    const latestTodo = parsedGroupedResponse.dueToday[dueTodayCount - 1];

    res = await agent.get("/todos");
    csrfToken = extractCsrfToken(res);

    const deletedResponse = await agent.delete(`/todos/${latestTodo.id}`).send({
      _csrf: csrfToken,
    });
    expect(deletedResponse.statusCode).toBe(200);
  });

  test("Test for verifying user A cannot delete a todo-item in user B", async () => {
    //signin user B
    agent = request.agent(server);
    await login(agent, "userB@gmail.com", "1234");

    //creating a Todo Item with user B
    res1 = await agent.get("/todos");
    csrfToken = extractCsrfToken(res1);
    await agent.post("/todos").send({
      title: "Buy csn",
      dueDate: new Date().toISOString(),
      completed: false,
      _csrf: csrfToken,
    });

    //Getting latest added todo-item in user B
    const groupedTodosResponse = await agent
      .get("/todos")
      .set("Accept", "application/json");
    const parsedGroupedResponse = JSON.parse(groupedTodosResponse.text);
    const dueTodayCount = parsedGroupedResponse.dueToday.length;
    const latestTodo = parsedGroupedResponse.dueToday[dueTodayCount - 1];

    //signout user B
    let res = await agent.get("/todos");
    expect(res.statusCode).toBe(200);
    res = await agent.get("/signout");
    expect(res.statusCode).toBe(302);
    res = await agent.get("/todos");
    expect(res.statusCode).toBe(302);

    //signin user A
    agent = request.agent(server);
    await login(agent, "userA@gmail.com", "1234");

    res = await agent.get("/todos");
    csrfToken = extractCsrfToken(res);

    // Deleting latest todo-item of user B from user A
    const deletedResponse = await agent.delete(`/todos/${latestTodo.id}`).send({
      _csrf: csrfToken,
    });
    expect(deletedResponse.statusCode).toBe(422);
  });
});
