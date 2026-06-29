import type { Types } from "mongoose";
import {
  Appointment,
  type AppointmentDocument,
} from "../db/models/appointment.model";

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const getDayRange = (date: Date) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return { startOfDay, endOfDay };
};

const addOneHour = (time: string): string => {
  const [hour, minute] = time.split(":").map(Number);

  const d = new Date();
  d.setHours(hour as number, minute, 0, 0);
  d.setHours(d.getHours() + 1);

  return d.toTimeString().slice(0, 5);
};

interface CreateAppointmentInput {
  doctorId: Types.ObjectId;
  patientId: Types.ObjectId;
  date: Date;
  startTime: string;
  endTime?: string;
  reason: string;
  googleEventId?: string;
  googleHangoutLink?: string;
}

export const createAppointment = async ({
  doctorId,
  googleEventId,
  googleHangoutLink,
  patientId,
  reason,
  date,
  startTime,
  endTime,
}: CreateAppointmentInput): Promise<AppointmentDocument> => {
  try {
    if (!doctorId || !patientId || !date || !startTime) {
      throw new Error("doctorId, patientId, date and startTime are required.");
    }

    const appointmentEndTime = endTime ?? addOneHour(startTime);
    const { startOfDay, endOfDay } = getDayRange(date);

    const conflict = await Appointment.findOne({
      doctorId,
      date: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      status: {
        $ne: "cancelled",
      },
      startTime: { $lt: appointmentEndTime },
      endTime: { $gt: startTime },
    });

    if (conflict) {
      throw new Error("This slot is already booked.");
    }

    return await Appointment.create({
      doctorId,
      patientId,
      date,
      startTime,
      endTime: appointmentEndTime,
      reason,
      googleEventId,
      googleHangoutLink,
      status: "confirmed",
    });
  } catch (error) {
    throw new Error(`Failed to create appointment: ${getErrorMessage(error)}`);
  }
};

export const getAppointmentById = async (
  appointmentId: string,
): Promise<AppointmentDocument> => {
  try {
    if (!appointmentId) {
      throw new Error("Appointment ID is required.");
    }

    const appointment = await Appointment.findById(appointmentId);

    if (!appointment) {
      throw new Error("Appointment not found.");
    }

    return appointment;
  } catch (error) {
    throw new Error(`Failed to fetch appointment: ${getErrorMessage(error)}`);
  }
};

export const getAppointmentsByDoctor = async (
  doctorId: string,
): Promise<AppointmentDocument[]> => {
  try {
    if (!doctorId) {
      throw new Error("Doctor ID is required.");
    }

    return await Appointment.find({ doctorId }).sort({ date: 1, startTime: 1 });
  } catch (error) {
    throw new Error(
      `Failed to fetch doctor appointments: ${getErrorMessage(error)}`,
    );
  }
};

export const getAppointmentsByPatient = async (
  patientId: string,
): Promise<AppointmentDocument[]> => {
  try {
    if (!patientId) {
      throw new Error("Patient ID is required.");
    }

    return await Appointment.find({ patientId }).sort({
      date: 1,
      startTime: 1,
    });
  } catch (error) {
    throw new Error(
      `Failed to fetch patient appointments: ${getErrorMessage(error)}`,
    );
  }
};

export const updateAppointmentStatus = async (
  appointmentId: string,
  status: "pending" | "confirmed" | "cancelled" | "completed",
): Promise<AppointmentDocument> => {
  try {
    if (!appointmentId) {
      throw new Error("Appointment ID is required.");
    }

    const appointment = await Appointment.findByIdAndUpdate(
      appointmentId,
      { status },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!appointment) {
      throw new Error("Appointment not found.");
    }

    return appointment;
  } catch (error) {
    throw new Error(
      `Failed to update appointment status: ${getErrorMessage(error)}`,
    );
  }
};

export const confirmAppointment = async (
  appointmentId: string,
): Promise<AppointmentDocument> => {
  return updateAppointmentStatus(appointmentId, "confirmed");
};

export const cancelAppointment = async (
  appointmentId: string,
): Promise<AppointmentDocument> => {
  return updateAppointmentStatus(appointmentId, "cancelled");
};

export const completeAppointment = async (
  appointmentId: string,
): Promise<AppointmentDocument> => {
  return updateAppointmentStatus(appointmentId, "completed");
};

export const getBookedAppointmentsForDoctor = async (
  doctorId: string,
  date: Date,
): Promise<AppointmentDocument[]> => {
  try {
    if (!doctorId) {
      throw new Error("Doctor ID is required.");
    }

    const { startOfDay, endOfDay } = getDayRange(date);

    return await Appointment.find({
      doctorId,
      date: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
      status: {
        $nin: ["cancelled"],
      },
    }).sort({ startTime: 1 });
  } catch (error) {
    throw new Error(
      `Failed to fetch booked appointments: ${getErrorMessage(error)}`,
    );
  }
};
