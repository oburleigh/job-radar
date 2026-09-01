const path = require("node:path");

const buildDirectory = process.env.JOB_RADAR_BUILD_DIRECTORY?.trim() || "build";

module.exports = [
  {
    name: "all production JavaScript",
    path: path.join(buildDirectory, "client/assets/*.js"),
    limit: "215 kB",
  },
  {
    name: "production CSS",
    path: path.join(buildDirectory, "client/assets/*.css"),
    limit: "14 kB",
  },
];
