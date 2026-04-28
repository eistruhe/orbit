import { Wrench } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function ToolsHubPage() {
  const navigate = useNavigate()

  return (
    <div className="space-y-4">
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="size-4" />
            Tinify
          </CardTitle>
          <CardDescription>
            Compress PNG and JPG images with the TinyPNG API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={() => navigate({ to: "/tools/tinify" })}>
            Open Tinify
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
