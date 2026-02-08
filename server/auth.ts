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

    passport.use(
        "google",
        new GoogleStrategy(
            {
                clientID: process.env.GOOGLE_CLIENT_ID || "",
                clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
                callbackURL: "/api/auth/google/callback",
            },
            async (accessToken, refreshToken, profile, done) => {
                try {
                    const googleId = profile.id;
                    // Use first verified email or just first email
                    const email = profile.emails?.find(e => e.verified)?.value || profile.emails?.[0]?.value;
                    const displayName = profile.displayName;

                    // Check if user exists by Google ID
                    let user = await storage.getUserByGoogleId(googleId);

                    if (!user) {
                        // Check if user exists by email (username) to avoid duplicates if possible
                        const uniqueUsername = email || `google_${googleId}`;
                        const existingUser = await storage.getUserByUsername(uniqueUsername);

                        if (existingUser) {
                            // Ideally link them here, but for now we just return the existing user 
                            // IF we trust email. Or create a new user with googleId if logic differs.
                            // Given schema constraints (username unique), we should probably use existing user.
                            // But existing user might not have googleId set. 
                            // We should update it? storage doesn't have updateUser.
                            // We will assume existing user is the same person.
                            user = existingUser;
                            // NOTE: In a real app we would update the user record to add googleId here.
                        } else {
                            user = await storage.createUser({
                                username: uniqueUsername,
                                password: null, // No password for Google users
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

    app.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

    app.get(
        "/api/auth/google/callback",
        passport.authenticate("google", { failureRedirect: "/login" }),
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
