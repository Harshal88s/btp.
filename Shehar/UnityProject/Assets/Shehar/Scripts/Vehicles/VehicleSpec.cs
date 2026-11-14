// Vehicle catalogue. Generic, unbranded Indian vehicle archetypes with distinct handling.
// Physical figures are typical ranges for each archetype (ASSUMPTION, game-tuned), not any manufacturer's data.
using System.Collections.Generic;
using UnityEngine;

namespace Shehar.Vehicles
{
    public enum VehicleClass { Hatchback, Sedan, SUV, Sports, AutoRickshaw, Scooter, Motorcycle, Bus, Truck, Taxi, Police, Ambulance }

    public sealed class VehicleSpec
    {
        public string Id, Name, Description;
        public VehicleClass Class;
        public int Price;                 // in-game rupees; 0 = starter, -1 = not for sale
        public float Mass = 1000f;        // kg
        public float PowerKW = 60f;
        public float MaxSpeedKmh = 150f;
        public float BrakeG = 0.9f;       // max braking deceleration in g
        public float SteerDeg = 34f;
        public float Grip = 1.0f;         // tyre friction coefficient (dry asphalt)
        public float Length = 3.8f, Width = 1.65f, Height = 1.5f, WheelBase = 2.4f, Track = 1.4f, WheelRadius = 0.3f;
        public float Drag = 0.33f, FrontalArea = 2.1f;
        public float FuelLitres = 35f, LitresPer100Km = 6f;
        public int Wheels = 4;            // visual wheel count; physics uses 4 contact points (3 for autos)
        public bool RearDrive, TwoWheeler, Commercial;
        public int Seats = 4;
        public Color[] Palette;
        public string HornKind = "car";

        public float MaxSpeed { get { return MaxSpeedKmh / 3.6f; } }

        public static readonly List<VehicleSpec> All = new List<VehicleSpec>
        {
            new VehicleSpec { Id = "hatch", Name = "Compact Hatchback", Class = VehicleClass.Hatchback, Price = 0,
                Description = "Nimble city runabout. Fits through gaps in Laxmi Road traffic.",
                Mass = 900, PowerKW = 50, MaxSpeedKmh = 150, Length = 3.7f, Width = 1.62f, Height = 1.52f, WheelBase = 2.42f, Track = 1.38f, WheelRadius = 0.29f,
                FuelLitres = 32, LitresPer100Km = 5.2f, Palette = new[] { new Color(0.85f, 0.85f, 0.86f), new Color(0.7f, 0.08f, 0.08f), new Color(0.95f, 0.95f, 0.95f), new Color(0.15f, 0.3f, 0.6f), new Color(0.45f, 0.45f, 0.47f) } },
            new VehicleSpec { Id = "sedan", Name = "Family Sedan", Class = VehicleClass.Sedan, Price = 25000,
                Description = "Comfortable highway cruiser with a long boot.",
                Mass = 1150, PowerKW = 85, MaxSpeedKmh = 180, Length = 4.4f, Width = 1.72f, Height = 1.48f, WheelBase = 2.65f, Track = 1.5f, WheelRadius = 0.31f,
                FuelLitres = 40, LitresPer100Km = 6.5f, Palette = new[] { new Color(0.95f, 0.95f, 0.95f), new Color(0.12f, 0.12f, 0.14f), new Color(0.55f, 0.56f, 0.6f), new Color(0.35f, 0.15f, 0.12f) } },
            new VehicleSpec { Id = "suv", Name = "Seven-Seater SUV", Class = VehicleClass.SUV, Price = 45000,
                Description = "High seating, soaks up potholes and speed breakers.",
                Mass = 1750, PowerKW = 115, MaxSpeedKmh = 175, Length = 4.6f, Width = 1.86f, Height = 1.85f, WheelBase = 2.75f, Track = 1.58f, WheelRadius = 0.37f,
                Grip = 0.95f, Drag = 0.4f, FrontalArea = 2.8f, RearDrive = true, FuelLitres = 60, LitresPer100Km = 9f, Seats = 7,
                Palette = new[] { new Color(0.08f, 0.08f, 0.09f), new Color(0.92f, 0.92f, 0.92f), new Color(0.25f, 0.3f, 0.22f), new Color(0.5f, 0.1f, 0.1f) } },
            new VehicleSpec { Id = "sports", Name = "Sports Coupe", Class = VehicleClass.Sports, Price = 120000,
                Description = "Rear-drive coupe. Brutal on the Expressway, a handful in the peths.",
                Mass = 1400, PowerKW = 250, MaxSpeedKmh = 270, Length = 4.5f, Width = 1.9f, Height = 1.25f, WheelBase = 2.65f, Track = 1.62f, WheelRadius = 0.33f,
                Grip = 1.15f, BrakeG = 1.1f, Drag = 0.3f, FrontalArea = 1.9f, RearDrive = true, FuelLitres = 60, LitresPer100Km = 12f, Seats = 2,
                Palette = new[] { new Color(0.95f, 0.55f, 0.05f), new Color(0.8f, 0.05f, 0.05f), new Color(0.05f, 0.25f, 0.65f), new Color(0.95f, 0.85f, 0.1f) } },
            new VehicleSpec { Id = "auto", Name = "Auto-rickshaw", Class = VehicleClass.AutoRickshaw, Price = 8000,
                Description = "Three wheels, a meter and nerves of steel. Required for rickshaw fares.",
                Mass = 380, PowerKW = 6, MaxSpeedKmh = 55, Length = 2.65f, Width = 1.3f, Height = 1.75f, WheelBase = 1.95f, Track = 1.15f, WheelRadius = 0.2f,
                SteerDeg = 40, Grip = 0.85f, BrakeG = 0.6f, Drag = 0.6f, FrontalArea = 2.0f, Wheels = 3, Commercial = true, FuelLitres = 8, LitresPer100Km = 3.5f, Seats = 3,
                HornKind = "auto", Palette = new[] { new Color(0.08f, 0.08f, 0.08f) } },
            new VehicleSpec { Id = "scooter", Name = "110cc Scooter", Class = VehicleClass.Scooter, Price = 5000,
                Description = "Pune's favourite way to beat traffic.",
                Mass = 190, PowerKW = 5.8f, MaxSpeedKmh = 85, Length = 1.8f, Width = 0.7f, Height = 1.15f, WheelBase = 1.26f, Track = 0.36f, WheelRadius = 0.25f,
                SteerDeg = 30, Grip = 0.9f, BrakeG = 0.7f, Drag = 0.7f, FrontalArea = 0.7f, Wheels = 2, TwoWheeler = true, FuelLitres = 5.3f, LitresPer100Km = 2f, Seats = 2,
                HornKind = "bike", Palette = new[] { new Color(0.95f, 0.95f, 0.95f), new Color(0.1f, 0.4f, 0.75f), new Color(0.75f, 0.1f, 0.15f), new Color(0.2f, 0.2f, 0.2f) } },
            new VehicleSpec { Id = "bike", Name = "150cc Motorcycle", Class = VehicleClass.Motorcycle, Price = 12000,
                Description = "Quick commuter bike - fastest way across the old city.",
                Mass = 210, PowerKW = 11, MaxSpeedKmh = 115, Length = 2.0f, Width = 0.75f, Height = 1.1f, WheelBase = 1.33f, Track = 0.36f, WheelRadius = 0.31f,
                SteerDeg = 28, Grip = 0.95f, BrakeG = 0.8f, Drag = 0.65f, FrontalArea = 0.75f, Wheels = 2, TwoWheeler = true, RearDrive = true, FuelLitres = 12, LitresPer100Km = 2.4f, Seats = 2,
                HornKind = "bike", Palette = new[] { new Color(0.1f, 0.1f, 0.1f), new Color(0.75f, 0.05f, 0.05f), new Color(0.1f, 0.2f, 0.6f) } },
            new VehicleSpec { Id = "taxi", Name = "City Taxi", Class = VehicleClass.Taxi, Price = 20000,
                Description = "Yellow-plate cab. Counts as a commercial vehicle for taxi fares.",
                Mass = 1100, PowerKW = 70, MaxSpeedKmh = 165, Length = 4.25f, Width = 1.7f, Height = 1.5f, WheelBase = 2.6f, Track = 1.48f, WheelRadius = 0.3f,
                Commercial = true, FuelLitres = 40, LitresPer100Km = 6f, Palette = new[] { new Color(0.95f, 0.95f, 0.93f) } },
            new VehicleSpec { Id = "police", Name = "Police Interceptor", Class = VehicleClass.Police, Price = -1,
                Description = "Police SUV with light bar.",
                Mass = 1700, PowerKW = 125, MaxSpeedKmh = 180, Length = 4.5f, Width = 1.84f, Height = 1.8f, WheelBase = 2.7f, Track = 1.58f, WheelRadius = 0.36f,
                RearDrive = true, FuelLitres = 60, LitresPer100Km = 9f, HornKind = "siren", Palette = new[] { new Color(0.96f, 0.96f, 0.96f) } },
            new VehicleSpec { Id = "ambulance", Name = "Ambulance", Class = VehicleClass.Ambulance, Price = -1,
                Description = "Emergency van for hospital runs.",
                Mass = 2400, PowerKW = 90, MaxSpeedKmh = 140, Length = 5.0f, Width = 1.9f, Height = 2.3f, WheelBase = 2.9f, Track = 1.62f, WheelRadius = 0.36f,
                Drag = 0.45f, FrontalArea = 3.6f, FuelLitres = 70, LitresPer100Km = 10f, HornKind = "siren", Palette = new[] { new Color(0.97f, 0.97f, 0.97f) } },
            new VehicleSpec { Id = "bus", Name = "City Bus", Class = VehicleClass.Bus, Price = 90000,
                Description = "12-metre city bus. Wide turns, huge presence.",
                Mass = 11000, PowerKW = 150, MaxSpeedKmh = 80, Length = 11.5f, Width = 2.55f, Height = 3.2f, WheelBase = 6.1f, Track = 2.05f, WheelRadius = 0.5f,
                SteerDeg = 38, Grip = 0.9f, BrakeG = 0.6f, Drag = 0.7f, FrontalArea = 7.5f, Wheels = 6, RearDrive = true, Commercial = true, FuelLitres = 200, LitresPer100Km = 30f, Seats = 40,
                HornKind = "heavy", Palette = new[] { new Color(0.85f, 0.35f, 0.12f), new Color(0.15f, 0.45f, 0.25f), new Color(0.2f, 0.35f, 0.65f) } },
            new VehicleSpec { Id = "truck", Name = "Goods Truck", Class = VehicleClass.Truck, Price = 70000,
                Description = "Hand-painted goods carrier. HORN OK PLEASE.",
                Mass = 9000, PowerKW = 130, MaxSpeedKmh = 80, Length = 8.5f, Width = 2.5f, Height = 3.4f, WheelBase = 4.8f, Track = 2.0f, WheelRadius = 0.5f,
                SteerDeg = 36, Grip = 0.85f, BrakeG = 0.55f, Drag = 0.8f, FrontalArea = 8f, Wheels = 6, RearDrive = true, Commercial = true, FuelLitres = 250, LitresPer100Km = 25f, Seats = 2,
                HornKind = "heavy", Palette = new[] { new Color(0.95f, 0.5f, 0.05f), new Color(0.1f, 0.35f, 0.7f), new Color(0.8f, 0.1f, 0.1f) } },
        };

        public static VehicleSpec Get(string id)
        {
            foreach (var s in All) if (s.Id == id) return s;
            return All[0];
        }
    }
}
