import asyncio
from datetime import datetime
from db import supabase
import sys
sys.path.append('routes')
from routes.notifications import notify_report_verified


async def verify_reports():
    """Background task that runs every 5 seconds to verify pending reports"""

    while True:
        try:
            print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Verifying pending reports...")

            # Fetch all pending reports (status = null)
            response = supabase.table("reports").select("*").is_("status", "null").execute()

            if not response.data:
                print("  No pending reports to verify")
            else:
                pending_reports = response.data
                print(f"  Found {len(pending_reports)} pending reports")

                for report in pending_reports:
                    report_id = report["id"]
                    user_id = report["user_id"]
                    route_id = report.get("route")  # Can be null
                    station_id = report.get("station_id")  # Can be null
                    delay = report.get("delay")  # Delay in minutes
                    reported_time = report["reported_time"]

                    # Skip if missing required fields
                    if not route_id or not station_id or delay is None:
                        print(f"  ⏸ Report {report_id} SKIPPED: Missing route, station_id, or delay")
                        continue

                    try:
                        # Fetch the route
                        route_response = supabase.table("routes").select("*").eq("id", route_id).execute()

                        if not route_response.data:
                            print(f"  Route {route_id} not found, skipping report {report_id}")
                            continue

                        route = route_response.data[0]
                        stations_info = route["stations_info"]

                        # Find the station in the route
                        station_found = False
                        current_time = datetime.now()

                        for station_info in stations_info:
                            if station_info["station_id"] == station_id:
                                station_found = True

                                actual_arrival = station_info["actual_arrival_time"]
                                scheduled_arrival = station_info["arrival_time"]
                                scheduled_arrival_dt = datetime.strptime(scheduled_arrival, "%Y-%m-%d %H:%M:%S")

                                # Calculate expected arrival with delay
                                # scheduled_arrival + delay should be <= current_time
                                from datetime import timedelta
                                expected_arrival_with_delay = scheduled_arrival_dt + timedelta(minutes=delay)

                                # Determine verification status
                                is_verified = False
                                verified_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                                # Verification logic:
                                # 1. (scheduled_arrival + delay) <= current_time (enough time has passed)
                                # 2. actual_arrival is null (bus hasn't arrived yet)

                                if expected_arrival_with_delay <= current_time and actual_arrival is None:
                                    # VERIFIED: delay time has passed and bus still hasn't arrived
                                    is_verified = True
                                    print(f"  ✓ Report {report_id} VERIFIED: Expected arrival with delay ({expected_arrival_with_delay}) passed, actual is null")
                                else:
                                    # NOT VERIFIED
                                    is_verified = False
                                    if actual_arrival is not None:
                                        print(f"  ✗ Report {report_id} NOT VERIFIED: Bus already arrived (actual arrival exists)")
                                    elif expected_arrival_with_delay > current_time:
                                        print(f"  ✗ Report {report_id} NOT VERIFIED: Not enough time passed yet (expected: {expected_arrival_with_delay}, now: {current_time})")
                                    else:
                                        print(f"  ✗ Report {report_id} NOT VERIFIED: Conditions not met")

                                # Update report status
                                supabase.table("reports").update({
                                    "status": is_verified,
                                    "verified_at": verified_at
                                }).eq("id", report_id).execute()

                                # If verified, award 1 point to user and send notification
                                if is_verified:
                                    user_response = supabase.table("users").select("*").eq("id", user_id).execute()

                                    if user_response.data:
                                        user = user_response.data[0]
                                        new_points = user.get("points", 0) + 1
                                        new_total_verified = user.get("total_verified_reports", 0) + 1

                                        supabase.table("users").update({
                                            "points": new_points,
                                            "total_verified_reports": new_total_verified,
                                            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                                        }).eq("id", user_id).execute()

                                        print(f"    User {user_id} awarded 1 point (total: {new_points})")

                                        # Send notification to user
                                        await notify_report_verified(user_id)

                                break

                        if not station_found:
                            print(f"  Station {station_id} not found in route {route_id}")

                    except Exception as e:
                        print(f"  Error verifying report {report_id}: {str(e)}")
                        import traceback
                        traceback.print_exc()

            print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Report verification completed\n")

        except Exception as e:
            print(f"Error in report verification: {e}")

        # Wait 5 seconds before next iteration
        await asyncio.sleep(5)