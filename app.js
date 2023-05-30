/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
const express = require("express");
var csrf = require("tiny-csrf");
const app = express();
const flash = require("connect-flash");
var cookieParser = require("cookie-parser");
const { Todo, User } = require("./models");
const bodyParser = require("body-parser");
const path = require("path");
app.set("views", path.join(__dirname, "views"));
app.use(flash());
const passport = require("passport");
const connectEnsureLogin = require("connect-ensure-login");
const session = require("express-session");
const LocalStrategy = require("passport-local");
const bcrypt = require("bcrypt");
const { where } = require("sequelize");
const saltRounds = 10;

app.use(bodyParser.json());

app.use(express.urlencoded({ extended: false }));

app.use(cookieParser("shh! some secret string"));

app.use(csrf("this_should_be_32_character_long", ["POST", "PUT", "DELETE"]));

app.set("view engine", "ejs");

app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: "my_super-secret-key-2148411464649777996311316",
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.use(function (request, response, next) {
  response.locals.messages = request.flash();
  next();
});

app.use(passport.initialize());
app.use(passport.session());

passport.use(
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
    },
    (username, password, done) => {
      User.findOne({ where: { email: username } })
        .then(async (user) => {
          const result = await bcrypt.compare(password, user.password);
          if (result) {
            return done(null, user);
          } else {
            return done(null, false, { message: "Invalid password" });
          }
        })
        .catch((error) => {
          return done(null, false, { message: "Invalid credentials" });
        });
    }
  )
);

passport.serializeUser((user, done) => {
  console.log("Serializing user in session", user.id);
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findByPk(id)
    .then((user) => {
      done(null, user);
    })
    .catch((error) => {
      done(error, null);
    });
});

app.get("/", async (request, response) => {
  response.render("index", {
    csrfToken: request.csrfToken(),
  });
});

app.get(
  "/todos",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    const loggedInUser = request.user.id;
    const overDue = await Todo.getOverDue(loggedInUser);
    const dueToday = await Todo.getDueToday(loggedInUser);
    const dueLater = await Todo.getDueLater(loggedInUser);
    const completed = await Todo.getCompleted(loggedInUser);
    const username = await User.getUserName(request.user.id);
    console.log("-------------"+username);
    if (request.accepts("html")) {
      response.render("todos", {
        overDue,
        dueToday,
        dueLater,
        completed,
        username,
        csrfToken: request.csrfToken(),
      });
    } else {
      response.json({
        overDue,
        dueToday,
        dueLater,
        completed,
        username,
      });
    }
  }
);

// app.get("/todos", async (request, response) => {
//   console.log("Todo List");
//   try {
//     const users = await Todo.findAll();
//     return response.json(users);
//   } catch (err) {
//     console.error(err);
//     return response.status(422).json(users);
//   }
// });

app.get("/signup", async (request, response) => {
  response.render("signup", {
    csrfToken: request.csrfToken(),
  });
});

app.get("/login", async (request, response) => {
  response.render("login", {
    csrfToken: request.csrfToken(),
  });
});

app.get("/signout", async (request, response, next) => {
  request.logOut((err) => {
    if (err) {
      return next(err);
    }
    response.redirect("/");
  });
});

app.post(
  "/session",
  passport.authenticate("local", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  async (request, response) => {
    response.redirect("/todos");
  }
);

app.post("/users", async (request, response) => {
  const hasedPwd = await bcrypt.hash(request.body.password, saltRounds);
  let flag = true;
  if (request.body.firstName.length == 0) {
    request.flash("error", "First Name should not be empty!");
    flag = false;
  }
  if (request.body.lastName.length == 0) {
    request.flash("error", "Last Name should not be empty!");
    flag = false;
  }
  if (request.body.email == 0) {
    request.flash("error", "Email should not be empty!");
    flag = false;
  }
  if (request.body.password == 0) {
    request.flash("error", "Password should not be empty!");
    flag = false;
  }
  try {
    if (flag == true) {
      const users = await User.create({
        firstName: request.body.firstName,
        lastName: request.body.lastName,
        email: request.body.email,
        password: hasedPwd,
      });

      request.login(users, (err) => {
        if (err) {
          console.error(err);
          request.flash("error", err);
        }
        response.redirect("/todos");
      });
    } else {
      response.redirect("/signup");
    }
  } catch (err) {
    console.error(err);
    request.flash("error", "Account Already exists");
    response.redirect("/signup");
  }
});

app.post(
  "/todos",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    console.log("Creating a todo", request.body, request.user.id);
    try {
      if (request.body.title.length == 0) {
        request.flash("error", "Please enter Todo-name");
      } else if (request.body.title.length < 5) {
        request.flash("error", "Todo-name length must be minimum 5 characters");
      }
      if (request.body.dueDate == 0) {
        request.flash("error", "Please enter dueDate");
      }
      if (request.body.title.length >= 5 && request.body.dueDate.length > 0) {
        const todo = await Todo.addTodo({
          title: request.body.title,
          dueDate: request.body.dueDate,
          completed: false,
          userId: request.user.id,
        });
        request.flash("success", "New Todo is Added");
      }
      return response.redirect("/todos");
    } catch (error) {
      console.error(error);
      return response.status(422).json(error);
    }
  }
);

app.put(
  "/todos/:id",
  connectEnsureLogin.ensureLoggedIn(),
  async (request, response) => {
    console.log("we have to update a todo with ID:", request.params.id);
    const loggedInUser = request.user.id;
    const todo = await Todo.findOne({
      where: {
        id: request.params.id,
        userId: loggedInUser,
      },
    });
    try {
      if (todo != null) {
        const updatedTodo = await todo.setCompletionStatus(
          request.body.completed
        );
        return response.json(updatedTodo);
      } else {
        return response.status(422).json(updatedTodo);
      }
    } catch (err) {
      console.error(err);
      return response.status(422).json(updatedTodo);
    }
  }
);

app.delete("/todos/:id", async (request, response) => {
  console.log("Delete a todo by ID:", request.params.id);
  try {
    const loggedInUser = request.user.id;
    let res = await Todo.remove(request.params.id, loggedInUser);
    if (res == 1) {
      return response.json({ success: true });
    } else {
      return response.status(422).json(res);
    }
  } catch (err) {
    return response.status(422).json(err);
  }
});

module.exports = app;
