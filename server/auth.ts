import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Express } from "express";
import session from "express-session";
import { storage } from "./storage";
import { User } from "../shared/schema";

export function setupAuth(app: Express) {
    const sessionSettings: session.SessionOptions = {
        secret: process.env.SESSION_SECRET || "super_secret_session_key",
        resave: false,
        saveUninitialized: false,
        store: undefined, // MemoryStore by default, which is fine for dev/demo
        cookie: {
            secure: process.env.NODE_ENV === "production",
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
    };

    app.set("trust proxy", 1);
    app.use(session(sessionSettings));
    app.use(passport.initialize());
    app.use(passport.session());

    const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
    const googleOAuthEnabled = Boolean(googleClientId && googleClientSecret);

    if (googleOAuthEnabled) {
        passport.use(
            "google",
            new GoogleStrategy(
                {
                    clientID: googleClientId,
                    clientSecret: googleClientSecret,
                    callbackURL: "/api/auth/google/callback",
                },
                async (_accessToken, _refreshToken, profile, done) => {
                    try {
                        const googleId = profile.id;
                        const email = profile.emails?.find(e => e.verified)?.value || profile.emails?.[0]?.value;

                        let user = await storage.getUserByGoogleId(googleId);

                        if (!user) {
                            const uniqueUsername = email || `google_${googleId}`;
                            const existingUser = await storage.getUserByUsername(uniqueUsername);

                            if (existingUser) {
                                user = existingUser;
                            } else {
                                user = await storage.createUser({
                                    username: uniqueUsername,
                                    password: null,
                                    googleId: googleId
                                });
                            }
                        }
                        return done(null, user);
                    } catch (err) {
                        return done(err as Error);
                    }
                }
            )
        );
    } else {
        console.warn("[Auth] Google OAuth disabled: GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET missing.");
    }

    passport.serializeUser((user: any, done) => {
        done(null, user.id);
    });

    passport.deserializeUser(async (id: string, done) => {
        try {
            const user = await storage.getUser(id);
            done(null, user);
        } catch (err) {
            done(err);
        }
    });

    app.get("/api/auth/google", (req, res, next) => {
        if (!googleOAuthEnabled) {
            return res.status(503).json({ message: "Google OAuth is disabled in this environment." });
        }
        return passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
    });

    app.get(
        "/api/auth/google/callback",
        (req, res, next) => {
            if (!googleOAuthEnabled) {
                return res.status(503).json({ message: "Google OAuth is disabled in this environment." });
            }
            return passport.authenticate("google", { failureRedirect: "/login" })(req, res, next);
        },
        (req, res) => {
            // Successful authentication, redirect home.
            res.redirect("/admin");
        }
    );

    app.get("/api/auth/logout", (req, res, next) => {
        req.logout((err) => {
            if (err) return next(err);
            res.redirect("/");
        });
    });

    app.get("/api/user", (req, res) => {
        if (req.isAuthenticated()) {
            res.json(req.user);
        } else {
            res.status(401).json({ message: "Not authenticated" });
        }
    });
}
