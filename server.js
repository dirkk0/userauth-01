const express = require("express")
const session = require("express-session")
const bodyParser = require("body-parser")
const fs = require("fs").promises
const fs2 = require("fs")
const path = require("path")

const bcrypt = require("bcrypt")
const crypto = require("crypto")

const archiver = require("archiver")
const ftp = require("basic-ftp")
const { start } = require("repl")

const app = express()
// const PORT = 3000
const PORT = process.env.PORT || 3000;

// console.log(`process.env.VERSION is ${typeof process.env.VERSION}, expected a string`)
if (!process.env.VERSION) {
  console.error("environment variable VERSION is not set, assuming the .env file is missing")
  process.exit(1)
}

console.log(process.env.MESSAGE)

// Define file paths
// const usersFilePath = path.join(__dirname, "data/users.json")
// const logFilePath = path.join(__dirname, "activity.log")
// const protectedDir = path.join(__dirname, "protected")

const usersFilePath = process.env.USERS_FILE_PATH // || path.join(__dirname, "data/users.json");
const protectedDir = process.env.PROTECTED_DIR // || path.join(__dirname, "protected");
const logFilePath = process.env.LOG_FILE_PATH // || path.join(__dirname, "activity.log");

// In-memory user management
let users = [] // Load users into memory on server startup
async function loadUsers() {
  try {
    const data = await fs.readFile(usersFilePath, "utf8")
    users = JSON.parse(data)
  } catch (error) {
    console.error("Error loading users:", error)
    users = []
  }
}

// Save users to file and update in-memory cache
async function saveUsers() {
  await fs.writeFile(usersFilePath, JSON.stringify(users, null, 2))
}
// users = loadUsers() // Load users when the server starts

;(async () => {
  try {
    await loadUsers()
  } catch (err) {
    console.error("Failed to load users:", err)
    process.exit(1)
  }
})()

// Helper function to log activity
async function logActivity(message) {
  const timestamp = new Date().toISOString()
  const logEntry = `[${timestamp}] ${message}\n`
  await fs.appendFile(logFilePath, logEntry)
}

// async function checkTextFileExists() {
//   fs2.existsSync("/home/dirkk/Downloads") ? console.log("Directory exists.") : console.log("Directory does not exist.")

//   // const files = await fs.readdir("/home/dirkk/Downloads")
//   // if (files?.includes("check.txt")) {
//   //   console.log("check.txt exists") //   console.log
//   // } else {
//   //   console.log("check.txt does not exist")
//   // }
// }

// checkTextFileExists()

// Middleware setup
app.use(bodyParser.urlencoded({ extended: true }))
app.use(express.json()) // To parse JSON request bodies

app.use(
  session({
    // Secret is used to sign the session cookie. It should be a long and unguessable string
    secret: "simple_secret",
    // Resave the session every time the user interacts with the server, even if the session hasn't changed
    resave: false,
    // Save the session even if the user hasn't interacted with the server yet (e.g. if they just opened a new tab)
    saveUninitialized: false,
    // Set the session cookie to expire after 30 minutes
    cookie: { maxAge: 30 * 60 * 1000 },
  })
)

app.use("/player", express.static("public/player"))

function generateRandomId(length = 8) {
  return crypto.randomBytes(length / 2).toString("hex")
}

// Load user data from JSON file

// let users = JSON.parse(require("fs").readFileSync("data/users.json", "utf8"))

// Register route
app.post("/register", async (req, res) => {
  const { email, password } = req.body

  try {
    // Check if email is already registered
    const userExists = users.some((user) => user.email === email)
    if (userExists) {
      return res.status(400).json({ message: "Email is already registered." })
    }

    // Generate random ID and hash the password
    const randomId = generateRandomId()
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create new user object
    const newUser = {
      id: randomId,
      email,
      password: hashedPassword,
      activated: false, // Set activated flag to false by default
    }

    // Add new user to in-memory array and save to file
    users.push(newUser)
    await saveUsers()

    // Create user's folder and initial files
    const userFolder = path.join(protectedDir, randomId)
    await fs.mkdir(userFolder, { recursive: true })
    await fs.writeFile(path.join(userFolder, "welcome.txt"), "Welcome to your folder!")
    await fs.writeFile(path.join(userFolder, "data.json"), "[]")

    // Log the registration event
    await logActivity(`User registered with email: ${email}, ID: ${randomId}. Account activation required.`)

    res.status(201).send("Registration successful. An admin must activate your account before you can log in.")
  } catch (error) {
    console.error("Error during registration:", error)
    res.status(500).send("Registration failed.")
  }
})

// Authentication Middleware
function isAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return next()
  } else {
    res.status(401).send("Unauthorized. Please <a href='/'>log in.</a>")
  }
}

// Login route
app.post("/login", async (req, res) => {
  const { email, password } = req.body

  try {
    // Find the user by email in the in-memory users array
    // console.log(users)
    const user = users.find((user) => user.email === email)

    // Check if the user exists
    if (!user) {
      await logActivity(`Failed login attempt for unknown email: ${email}`)
      return res.status(401).json({ message: "Invalid email or password." })
    }

    // Check if the account is activated
    if (!user.activated) {
      await logActivity(`Failed login attempt for inactive account with email: ${email}`)
      return res.status(403).json({ message: "Your account is not activated. Please contact an admin." })
    }

    // Verify the password
    const passwordMatch = await bcrypt.compare(password, user.password)
    if (!passwordMatch) {
      await logActivity(`Failed login attempt with incorrect password for email: ${email}`)
      return res.status(401).json({ message: "Invalid email or password." })
    }

    // Set up session data for the authenticated user
    req.session.user = { id: user.id, email: user.email }

    // Log the successful login event
    await logActivity(`User logged in with ID: ${user.id}, Email: ${user.email}`)

    res.json({ message: "Login successful." })
  } catch (error) {
    console.error("Error during login:", error)
    res.status(500).send("Login failed.")
  }
})

// Logout route
app.post("/logout", (req, res) => {
  const userId = req.session.user ? req.session.user.id : "unknown"

  req.session.destroy(async (err) => {
    if (err) {
      return res.status(500).send("Failed to logout")
    }

    await logActivity(`User logged out with ID: ${userId}`)
    res.send("Logged out successfully")
  })
})

// Data route to list files in user folder
app.get("/data", isAuthenticated, async (req, res) => {
  const userId = req.session.user.id
  const userFolder = path.join(__dirname, "protected", String(userId))

  try {
    const files = await fs.readdir(userFolder)
    res.json({ files })
  } catch (error) {
    console.error("Error retrieving files:", error)
    res.status(500).send("Error retrieving files")
  }
})

// Data route, protected by authentication
// app.get('/data2',  (req, res) => {
//   const userId = "ba098ddf" //req.session.user.id;
//   const userFolder = path.join(__dirname, 'protected', String(userId));

//   // Serve static files from the user's specific folder
//   app.use(`/data2`, express.static(userFolder));
//   console.log(`Serving data for User ID: ${userId} ${userFolder}`);

//   res.send(`Serving data for User ID: ${userId}`);
// });

// Route to read the content of a specific file
// app.get("/view/:filename*", async (req, res) => {
app.get("/view/:filename*", isAuthenticated, async (req, res) => {
  const userId = req.session.user.id
  // const userId = "d58dfd46" //req.session.user.id;
  const userFolder = path.join(__dirname, "protected", String(userId))
  const filePath = path.join(userFolder, req.params.filename)

  console.log(filePath)

  try {
    const content = await fs.readFile(filePath, "utf8")
    res.send(content)
  } catch (error) {
    console.error("Error reading file:", error)
    res.status(404).send("File not found")
  }
})

// Route to read the content of a specific file
app.get("/data/:filename", isAuthenticated, async (req, res) => {
  const userId = req.session.user.id
  const userFolder = path.join(__dirname, "protected", String(userId))
  const filePath = path.join(userFolder, req.params.filename)

  try {
    const content = await fs.readFile(filePath, "utf8")
    res.json({ content })
  } catch (error) {
    console.error("Error reading file:", error)
    res.status(404).send("File not found")
  }
})

// Route to read the content of a specific file
// app.get("/data/:filename", isAuthenticated, async (req, res) => {
//   const userId = req.session.user.id
//   const userFolder = path.join(__dirname, "protected", String(userId))
//   const filePath = path.join(userFolder, req.params.filename)

//   try {
//     const content = await fs.readFile(filePath, "utf8")
//     res.json({ content })
//   } catch (error) {
//     console.error("Error reading file:", error)
//     res.status(404).send("File not found")
//   }
// })

// Route to save the content to a specific file
app.put("/data/:filename", isAuthenticated, async (req, res) => {
  console.log("does it", req.body)
  const userId = req.session.user.id
  const userFolder = path.join(__dirname, "protected", String(userId))
  const filePath = path.join(userFolder, req.params.filename)

  const { content } = req.body
  console.log(content)

  try {
    await fs.writeFile(filePath, content, "utf8")
    res.send("File saved successfully")
  } catch (error) {
    console.error("Error saving file:", error)
    res.status(500).send("Error saving file")
  }
})

// Route to create a new file in the user's folder
app.post("/data", isAuthenticated, async (req, res) => {
  const userId = req.session.user.id
  const { filename, content } = req.body
  const userFolder = path.join(__dirname, "protected", String(userId))
  const filePath = path.join(userFolder, filename)

  try {
    // Check if the file already exists
    const files = await fs.readdir(userFolder)
    if (files.includes(filename)) {
      return res.status(400).json({ message: "File already exists." })
    }

    // Create the file with the specified content
    await fs.writeFile(filePath, content, "utf8")
    res.send("File created successfully")
  } catch (error) {
    console.error("Error creating file:", error)
    res.status(500).send("Error creating file")
  }
})

// Route to delete a file in the user's folder
app.delete("/data/:filename", isAuthenticated, async (req, res) => {
  const userId = req.session.user.id
  const userFolder = path.join(__dirname, "protected", String(userId))
  const filePath = path.join(userFolder, req.params.filename)

  try {
    // Check if the file exists
    const files = await fs.readdir(userFolder)
    if (!files.includes(req.params.filename)) {
      return res.status(404).send("File not found")
    }

    // Delete the file
    await fs.unlink(filePath)
    res.send("File deleted successfully")
  } catch (error) {
    console.error("Error deleting file:", error)
    res.status(500).send("Error deleting file")
  }
})

// =====

// Password change route
app.post("/change-password", isAuthenticated, async (req, res) => {
  const { oldPassword, newPassword } = req.body
  const userId = req.session.user.id

  try {
    users = await loadUsers()
    const user = users.find((u) => u.id === userId)

    if (!user) {
      return res.status(404).json({ message: "User not found." })
    }

    const passwordMatch = await bcrypt.compare(oldPassword, user.password)
    if (!passwordMatch) {
      return res.status(401).json({ message: "Old password is incorrect." })
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10)
    user.password = hashedNewPassword

    await fs.writeFile(usersFilePath, JSON.stringify(users, null, 2))
    await logActivity(`User ${userId} changed their password.`)

    res.json({ message: "Password changed successfully." })
  } catch (error) {
    console.error("Error changing password:", error)
    res.status(500).send("Password change failed.")
  }
})

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/info.html"))
})

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin.html"))
})

app.get("/playlist", (req, res) => {
  res.sendFile(path.join(__dirname, "public/playlist.html"))
})

// app.get("/player", (req, res) => {
//   res.sendFile(path.join(__dirname, "public/player.html"))
// })

// app.get("/player.js", (req, res) => {
//   res.sendFile(path.join(__dirname, "public/player.js"))
// })

// ==== BACKUP start =====

// Function to compress directories
async function compressDirectories() {
  const outputFilePath = path.join(__dirname, "backup.zip")
  const output = fs2.createWriteStream(outputFilePath)
  const archive = archiver("zip", { zlib: { level: 9 } })

  return new Promise((resolve, reject) => {
    output.on("close", () => {
      console.log(`Archive created successfully, total bytes: ${archive.pointer()}`)
      resolve(outputFilePath)
    })

    archive.on("error", (err) => {
      console.error("Error during compression:", err)
      reject(err)
    })

    archive.pipe(output)

    // Append directories to archive
    archive.directory(protectedDir, "protected")
    archive.directory(path.join(__dirname, "data"), "data")

    archive.finalize()
  })
}

// Function to upload file to FTP server
// Function to upload file to FTP server
async function uploadToFTP(filePath) {
  const client = new ftp.Client()
  client.ftp.verbose = true

  try {
    await client.access({
      host: process.env.FTP_HOST,
      port: process.env.FTP_PORT || 21,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      secure: false, // You can set this to true if the FTP server supports FTPS
    })

    console.log("Connected to FTP server")

    // Check if there is an existing backup file and rename it with a timestamp
    const existingBackup = "backup.zip"
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const backupWithTimestamp = `backup_${timestamp}.zip`

    try {
      // Rename the existing backup if it exists
      await client.rename(existingBackup, backupWithTimestamp)
      console.log(`Renamed existing backup to ${backupWithTimestamp}`)
    } catch (err) {
      if (err.code !== 550) {
        // 550 indicates that the file does not exist
        throw err
      } else {
        console.log("No existing backup to rename.")
      }
    }

    // Upload the new backup file
    await client.uploadFrom(filePath, path.basename(filePath))
    console.log("File uploaded successfully")
  } catch (err) {
    console.error("Error uploading to FTP server:", err)
  } finally {
    client.close()
  }
}
// Function to download file from FTP server
async function downloadFromFTP(remoteFilePath, localFilePath) {
  const client = new ftp.Client()
  client.ftp.verbose = true

  try {
    await client.access({
      host: process.env.FTP_HOST,
      port: process.env.FTP_PORT || 21,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      secure: false, // You can set this to true if the FTP server supports FTPS
    })

    console.log("Connected to FTP server")
    await client.downloadTo(localFilePath, remoteFilePath)
    console.log("File downloaded successfully")
  } catch (err) {
    console.error("Error downloading from FTP server:", err)
  } finally {
    client.close()
  }
}

// Route to compress and upload directories to FTP server
app.post("/backup", async (req, res) => {
  try {
    // Compress directories
    const compressedFilePath = await compressDirectories()

    // Upload to FTP server
    await uploadToFTP(compressedFilePath)

    res.send("Backup and upload completed successfully.")
  } catch (error) {
    console.error("Error during backup and upload:", error)
    res.status(500).send("Error during backup and upload.")
  }
})

// Route to restore backup from FTP server
app.post("/restore", async (req, res) => {
  try {
    const remoteFilePath = req.query.filename || "backup.zip"
    const localFilePath = path.join(__dirname, remoteFilePath)

    // Download backup from FTP server
    await downloadFromFTP(remoteFilePath, localFilePath)

    // Extract backup
    const unzip = require("unzipper")
    const stream = fs2.createReadStream(localFilePath).pipe(unzip.Extract({ path: __dirname }))

    stream.on("close", () => {
      console.log("Backup restored successfully")
      res.send("Backup restored successfully.")
    })

    stream.on("error", (error) => {
      console.error("Error during backup restoration:", error)
      res.status(500).send("Error during backup restoration.")
    })
  } catch (error) {
    console.error("Error during backup restoration:", error)
    res.status(500).send("Error during backup restoration.")
  }
})

// HTML page to trigger backup
app.get("/backup-page", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Backup Page</title>
    </head>
    <body>
      <h1>Backup Data</h1>
      <button onclick="triggerBackup()">Start Backup</button>
      <button onclick="triggerRestore()">Restore Backup</button>
      <p id="status"></p>
      <script>
        async function triggerBackup() {
          document.getElementById('status').innerText = 'Starting backup...';
          try {
            const response = await fetch('/backup', {
              method: 'POST'
            });
            if (response.ok) {
              document.getElementById('status').innerText = 'Backup completed successfully.';
            } else {
              document.getElementById('status').innerText = 'Backup failed.';
            }
          } catch (error) {
            document.getElementById('status').innerText = 'Error during backup.';
          }
        }

        async function triggerRestore() {
          const filename = prompt('Enter the backup filename to restore (leave empty for latest backup):', 'backup.zip');
          document.getElementById('status').innerText = 'Starting restore...';
          try {
            const response = await fetch("/restore?filename=" + filename, {
              method: 'POST'
            });
            if (response.ok) {
              document.getElementById('status').innerText = 'Restore completed successfully.';
            } else {
              document.getElementById('status').innerText = 'Restore failed.';
            }
          } catch (error) {
            document.getElementById('status').innerText = 'Error during restore.';
          }
        }
      </script>
    </body>
    </html>
  `)
})

// ==== BACKUP end =====

// Route to check session
app.get("/session", (req, res) => {
  if (req.session && req.session.user) {
    res.json({ loggedIn: true, user: req.session.user })
  } else {
    res.json({ loggedIn: false })
  }
})

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`)
})
