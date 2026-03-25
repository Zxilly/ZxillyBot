import {createProbot, createNodeMiddleware} from "probot";

import app from "../../../src/index";

const probot = createProbot()

export default createNodeMiddleware(app, {probot, webhooksPath: "/api/github/webhooks"})