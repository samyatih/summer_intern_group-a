import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import API from "@/services/auth";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

import {
  Eye,
  EyeOff,
  Loader2,
  Mail,
  Lock,
  BookOpen,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

export default function Register() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);

  const [success, setSuccess] = useState("");

  const [error, setError] = useState("");

  const handleRegister = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    setLoading(true);
    setSuccess("");
    setError("");

    try {
      await API.post("/api/auth/register", {
        email,
        password,
      });

      setSuccess(
        "Registration successful! Redirecting to Login..."
      );

      setTimeout(() => {
        navigate("/login");
      }, 1500);
    } catch (err: any) {
      if (err.response) {
        setError(err.response.data.detail);
      } else {
        setError("Unable to connect to server.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-white to-indigo-100 flex">

      {/* Left Section */}

      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex-col justify-center px-16">

        <BookOpen className="w-16 h-16 mb-8" />

        <h1 className="text-5xl font-extrabold mb-6">
          Welcome to Gamified LMS
        </h1>

        <p className="text-xl leading-9 text-blue-100">
          Learn smarter.
          <br />
          Complete lessons.
          <br />
          Earn XP & Badges.
          <br />
          Maintain your streak.
        </p>

        <div className="mt-16 space-y-5 text-lg">
          <p>🎯 Personalized Learning</p>
          <p>🏆 Earn XP & Unlock Levels</p>
          <p>🔥 Maintain Daily Streaks</p>
          <p>📺 Interactive Video Lessons</p>
        </div>

      </div>

      {/* Right Section */}

      <div className="flex flex-1 items-center justify-center p-6">

        <Card className="w-full max-w-md rounded-3xl shadow-2xl border-0">

          <CardContent className="p-10">

            <h2 className="text-4xl font-bold text-center">
              Create Account
            </h2>

            <p className="text-center text-gray-500 mt-2 mb-8">
              Join the Gamified LMS today
            </p>

            <form
              onSubmit={handleRegister}
              className="space-y-5"
            >

              {/* Email */}

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Email
                </label>

                <div className="relative">

                  <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />

                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-12 rounded-xl"
                    required
                  />

                </div>
              </div>

              {/* Password */}

              <div className="space-y-2">

                <label className="text-sm font-medium">
                  Password
                </label>

                <div className="relative">

                  <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />

                  <Input
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    placeholder="Create a password"
                    value={password}
                    onChange={(e) =>
                      setPassword(e.target.value)
                    }
                    className="pl-10 pr-12 h-12 rounded-xl"
                    required
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        !showPassword
                      )
                    }
                    className="absolute right-3 top-3 text-gray-500 hover:text-black"
                  >

                    {showPassword ? (
                      <EyeOff size={20} />
                    ) : (
                      <Eye size={20} />
                    )}

                  </button>

                </div>

              </div>
                            {/* Success Message */}

              {success && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-green-700">
                  <CheckCircle size={18} />
                  <span>{success}</span>
                </div>
              )}

              {/* Error Message */}

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
                  <AlertCircle size={18} />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl text-lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>

            </form>

            <div className="mt-8 text-center text-sm text-gray-600">
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-semibold text-blue-600 hover:text-blue-700"
              >
                Login
              </Link>
            </div>

            <div className="mt-8 border-t pt-6 text-center">
              <p className="text-xs text-gray-400">
                © 2026 Gamified LMS. Learn • Earn XP • Grow
              </p>
            </div>

          </CardContent>

        </Card>

      </div>

    </div>
  );
}